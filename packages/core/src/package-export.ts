import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rmdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { validateTenderId } from './ingest.js';
import { digest, originalBytes, type Evidence } from './evidence.js';
import { matrixMarkdown, type Matrix } from './matrix.js';

export function packagePreview(matrix: Matrix, docs: Evidence[]) {
  const cited = new Set(matrix.rows.flatMap((r) => r.citasEvidencia.map((c) => c.documentId)));
  return docs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    originalName: doc.original?.name ?? null,
    cited: cited.has(doc.id),
    hasOriginal: Boolean(doc.original),
    analysisStatus: doc.analysisStatus ?? 'analizado',
    fictional: doc.fictional,
  }));
}
const safeName = (name: string) =>
  basename(name.replaceAll('\\', '/'))
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^\.+/u, '')
    .slice(0, 140) || 'documento';
/** Crea una copia nueva; nunca escribe sobre una carpeta de postulación existente. */
export async function exportPackage(
  matrix: Matrix,
  docs: Evidence[],
  answers: Record<string, string>,
  selectedIds: string[],
  destination: string,
  vault: string,
) {
  validateTenderId(matrix.tenderId);
  if (!isAbsolute(destination))
    throw new Error('Escribe la ruta absoluta de una carpeta existente.');
  const parent = await realpath(destination).catch(() => {
    throw new Error('La carpeta de destino no existe o no tienes permiso para abrirla.');
  });
  if (!(await stat(parent)).isDirectory())
    throw new Error('El destino debe ser una carpeta existente.');
  const vaultPath = await realpath(vault);
  const within = relative(vaultPath, parent);
  if (!within || (!within.startsWith(`..${sep}`) && within !== '..' && !isAbsolute(within)))
    throw new Error('Elige un destino fuera del baúl para conservar una copia independiente.');
  if (new Set(selectedIds).size !== selectedIds.length)
    throw new Error('Hay documentos duplicados en la selección.');
  const selected = selectedIds.map((id) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc) throw new Error('La selección contiene documentos que ya no están en el baúl.');
    return doc;
  });
  // Verificar todos los originales antes de publicar la carpeta.
  const staging = await mkdtemp(join(parent, '.bidpilot-')).catch(() => {
    throw new Error('No se pudo escribir en la carpeta de destino. Revisa sus permisos.');
  });
  const output = join(
    parent,
    `BidPilot-${matrix.tenderId}-${new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date())}-${basename(staging).slice(10)}`,
  );
  try {
    await mkdir(join(staging, 'documentos'), { mode: 0o700 });
    const files: {
      documentId: string;
      name: string;
      path: string;
      sha256: string;
      analysisStatus: string;
      fictional: boolean;
    }[] = [];
    for (const doc of selected) {
      const bytes = await originalBytes(vault, doc);
      const path = `documentos/${doc.id}-${safeName(doc.original?.name ?? doc.name)}`;
      await writeFile(join(staging, path), bytes, { mode: 0o600, flag: 'wx' });
      files.push({
        documentId: doc.id,
        name: doc.name,
        path,
        sha256: digest(bytes),
        analysisStatus: doc.analysisStatus ?? 'analizado',
        fictional: doc.fictional,
      });
    }
    const references = matrix.rows.map((r) => ({
      requirementId: r.requirementId,
      estado: r.estado,
      pendienteRevision: r.pendienteRevision,
      bases: r.requisito.citas,
      evidencia: r.citasEvidencia.map((c) => ({
        ...c,
        file: files.find((f) => f.documentId === c.documentId)?.path ?? null,
        included: selectedIds.includes(c.documentId),
      })),
    }));
    const questionList = matrix.rows
      .filter((r) => r.pregunta || answers[r.requirementId])
      .map((r) => ({
        requirementId: r.requirementId,
        pregunta: r.pregunta,
        respuesta: answers[r.requirementId] ?? null,
      }));
    const json = (path: string, value: unknown) =>
      writeFile(join(staging, path), JSON.stringify(value, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
    await json('matriz.json', matrix);
    await writeFile(join(staging, 'matriz.md'), matrixMarkdown(matrix), {
      mode: 0o600,
      flag: 'wx',
    });
    await json('preguntas.json', questionList);
    await json('referencias.json', references);
    await json('contenido.json', {
      schemaVersion: 1,
      tenderId: matrix.tenderId,
      exportedAt: new Date().toISOString(),
      fictional: matrix.fictional,
      files,
      omittedCitedIds: [
        ...new Set(matrix.rows.flatMap((r) => r.citasEvidencia.map((c) => c.documentId))),
      ].filter((id) => !selectedIds.includes(id)),
      matrixSha256: digest(await readFile(join(staging, 'matriz.json'))),
    });
    await writeFile(
      join(staging, 'LEEME.txt'),
      'Copia de revisión de BidPilot CL. No es una oferta presentada ni un paquete listo para enviar.\nRevisa las bases originales, sus aclaraciones y cada documento antes de postular.\nmatriz.json y matriz.md conservan el análisis íntegro, incluidas citas a documentos no seleccionados.\nreferencias.json indica qué archivos se incluyeron y cuáles se omitieron; contenido.json registra sus hashes.\nLos documentos sin analizar se guardan como adjuntos: no acreditan cumplimiento por sí solos.\n' +
        (matrix.fictional ? 'PERFIL FICTICIO: SOLO DEMOSTRACIÓN.\n' : ''),
      { mode: 0o600, flag: 'wx' },
    );
    await mkdir(output, { mode: 0o700 });
    try {
      await rename(staging, output);
    } catch (error) {
      await rmdir(output).catch(() => {});
      throw error;
    }
    return { path: output, documents: files.length };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
