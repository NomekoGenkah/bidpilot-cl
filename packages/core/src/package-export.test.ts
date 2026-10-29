import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { addEvidence, digest, originalBytes } from './evidence.js';
import { exportPackage, packagePreview } from './package-export.js';
import type { Matrix } from './matrix.js';
let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'bidpilot-export-'));
  const vault = join(root, 'vault');
  const destination = join(root, 'destino');
  await mkdir(destination);
  const doc = await addEvidence(
    vault,
    'Certificado',
    'texto',
    Buffer.from('Certificado ficticio con dos proyectos.'),
    true,
    '../../certificado.txt',
  );
  const other = await addEvidence(
    vault,
    'No citado',
    'archivo',
    Buffer.from([1, 2, 3]),
    true,
    'otro.docx',
  );
  const matrix: Matrix = {
    schemaVersion: 1,
    tenderId: '730566-25-L124',
    createdAt: new Date().toISOString(),
    model: 'test',
    sourceSha256: 'a'.repeat(64),
    requirementsSha256: 'b'.repeat(64),
    evidenceSha256: 'c'.repeat(64),
    answersSha256: 'd'.repeat(64),
    basisReviewSha256: 'e'.repeat(64),
    fictional: true,
    requiresHumanReview: true,
    rows: [
      {
        requirementId: 'REQ-001',
        estado: 'cumple',
        sustentoBases: true,
        aplicabilidad: 'aplica',
        contradiccion: false,
        razon: 'Dos proyectos acreditados en la evidencia ficticia.',
        pregunta: '¿Está vigente?',
        pendienteRevision: false,
        motivos: [],
        requisito: {
          id: 'REQ-001',
          descripcion: 'Acreditar dos proyectos.',
          categoria: 'tecnica',
          etapa: 'oferta',
          naturaleza: 'obligacion',
          paginaPrincipal: 1,
          condicionAplicacion: null,
          alternativasAceptadas: [],
          citas: [
            { pagina: 1, texto: 'El oferente debe acreditar dos proyectos.', clausula: null },
          ],
        },
        citasEvidencia: [
          {
            documentId: doc.id,
            pagina: 1,
            texto: 'Certificado ficticio con dos proyectos.',
            documento: doc.name,
            fictional: true,
          },
        ],
      },
    ],
  };
  return { vault, destination, doc, other, matrix };
}
it('exporta copias independientes con referencias, selección y hashes sin sobrescribir', async () => {
  const { vault, destination, doc, other, matrix } = await setup();
  expect(
    packagePreview(matrix, [doc, other])
      .filter((d) => d.cited)
      .map((d) => d.id),
  ).toEqual([doc.id]);
  const result = await exportPackage(
    matrix,
    [doc, other],
    { 'REQ-001': 'Sí, declaración ficticia.' },
    [doc.id],
    destination,
    vault,
  );
  const manifest = JSON.parse(await readFile(join(result.path, 'contenido.json'), 'utf8')) as {
    files: { path: string; sha256: string }[];
  };
  expect(manifest.files).toHaveLength(1);
  const file = manifest.files[0];
  if (!file) throw Error('Falta el archivo');
  expect(await readFile(join(result.path, file.path))).toEqual(await originalBytes(vault, doc));
  expect(file.sha256).toBe(digest(await readFile(join(result.path, file.path))));
  expect(
    JSON.parse(await readFile(join(result.path, 'referencias.json'), 'utf8'))[0].evidencia[0]
      .included,
  ).toBe(true);
  expect(await readFile(join(result.path, 'preguntas.json'), 'utf8')).toContain(
    'Sí, declaración ficticia.',
  );
  await writeFile(join(vault, doc.original?.file ?? ''), 'cambio');
  expect(await readFile(join(result.path, file.path), 'utf8')).toContain('Certificado ficticio');
  const second = await exportPackage(matrix, [doc, other], {}, [], destination, vault);
  expect(second.path).not.toBe(result.path);
  expect(await readFile(join(second.path, 'contenido.json'), 'utf8')).toContain(doc.id);
});
it('rechaza destinos inválidos, originales ausentes/manipulados y limpia fallos', async () => {
  const { vault, destination, doc, other, matrix } = await setup();
  await expect(exportPackage(matrix, [doc], {}, [doc.id], 'relativo', vault)).rejects.toThrow(
    'absoluta',
  );
  await expect(exportPackage(matrix, [doc], {}, [doc.id], vault, vault)).rejects.toThrow(
    'fuera del baúl',
  );
  const legacy = { ...doc };
  delete legacy.original;
  await expect(exportPackage(matrix, [legacy], {}, [doc.id], destination, vault)).rejects.toThrow(
    'antiguo',
  );
  await expect(exportPackage(matrix, [doc], {}, [other.id], destination, vault)).rejects.toThrow(
    'selección',
  );
  if (!doc.original) throw Error('Original ausente');
  await writeFile(join(vault, doc.original.file), 'alterado');
  await expect(exportPackage(matrix, [doc], {}, [doc.id], destination, vault)).rejects.toThrow(
    'hash',
  );
  expect(await readdir(destination)).toEqual([]);
});
