import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { z } from 'zod';
import { extractPdfPages } from './ingest.js';

export const evidenceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(180),
  kind: z.enum(['texto', 'pdf', 'archivo']),
  original: z
    .object({ file: z.string().regex(/^[a-f0-9-]{36}\.bin$/), name: z.string().min(1).max(180) })
    .optional(),
  analysisStatus: z.enum(['analizado', 'sin_analizar']).optional(),
  analysisNote: z.string().optional(),
  fictional: z.boolean(),
  sha256: z.string(),
  createdAt: z.string(),
  pages: z.array(z.object({ page: z.number().int().positive(), text: z.string() })),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const normalized = (s: string) => s.normalize('NFC').replace(/\s+/gu, ' ').trim();
export const digest = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export async function saveJson(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function readEvidence(root: string): Promise<Evidence[]> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const files = (await readdir(root)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (f) => evidenceSchema.parse(JSON.parse(await readFile(join(root, f), 'utf8')))),
  );
}
export async function addEvidence(
  root: string,
  name: string,
  kind: 'texto' | 'pdf' | 'archivo',
  bytes: Buffer,
  fictional = false,
  originalName?: string,
  replaceId?: string,
) {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw new Error('Documento vacío o mayor a 8 MB.');
  const id = replaceId ? z.string().uuid().parse(replaceId) : randomUUID();
  const previous = replaceId ? (await readEvidence(root)).find((d) => d.id === id) : undefined;
  if (replaceId && !previous) throw new Error('El documento ya no está en el baúl.');
  await mkdir(root, { recursive: true, mode: 0o700 });
  let pages: Evidence['pages'] = [];
  let analysisNote: string | undefined;
  if (kind === 'pdf') {
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('El archivo no tiene una cabecera PDF válida.');
    const temp = join(root, `${id}.pdf.tmp`);
    try {
      await writeFile(temp, bytes, { mode: 0o600 });
      try {
        pages = (await extractPdfPages(temp)).pages;
      } catch {
        analysisNote = 'No se pudo extraer texto del PDF. Puede necesitar OCR o estar protegido.';
      }
    } finally {
      await unlink(temp).catch(() => {});
    }
  } else if (kind === 'texto') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('El archivo debe contener texto UTF-8 legible.');
    }
    if (!text.trim() || text.includes('\0'))
      throw new Error('El archivo debe contener texto UTF-8 legible.');
    pages = [{ page: 1, text }];
  }
  if (pages.reduce((n, p) => n + p.text.length, 0) > 200_000) {
    pages = [];
    analysisNote = 'El texto excede el límite de 200.000 caracteres para análisis.';
  }
  const original = {
    file: `${randomUUID()}.bin`,
    name:
      basename(
        (
          originalName ?? name + (kind === 'texto' ? '.txt' : kind === 'pdf' ? '.pdf' : '')
        ).replaceAll('\\', '/'),
      )
        .split('')
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join('')
        .slice(0, 180) || 'documento',
  };
  const doc = evidenceSchema.parse({
    id,
    name: name.trim(),
    kind,
    fictional,
    sha256: digest(bytes),
    createdAt: new Date().toISOString(),
    pages,
    original,
    analysisStatus: pages.length ? 'analizado' : 'sin_analizar',
    ...(analysisNote ? { analysisNote } : {}),
  });
  await writeFile(join(root, original.file), bytes, { mode: 0o600, flag: 'wx' });
  try {
    await saveJson(join(root, `${id}.json`), doc);
  } catch (error) {
    await unlink(join(root, original.file));
    throw error;
  }
  if (previous?.original) await unlink(join(root, previous.original.file)).catch(() => {});
  return doc;
}
/** Búsqueda local por términos; devuelve páginas originales para poder comprobar citas. */
export function searchEvidence(docs: Evidence[], query: string, limit = 12) {
  const terms = [...new Set(query.toLocaleLowerCase('es').match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  return docs
    .filter((doc) => doc.analysisStatus !== 'sin_analizar')
    .flatMap((doc) =>
      doc.pages.map((p) => ({
        documentId: doc.id,
        name: doc.name,
        fictional: doc.fictional,
        ...p,
        score: terms.reduce(
          (n, term) => n + (p.text.toLocaleLowerCase('es').includes(term) ? 1 : 0),
          0,
        ),
      })),
    )
    .filter((p) => !terms.length || p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function originalBytes(root: string, doc: Evidence) {
  if (!doc.original)
    throw new Error(
      'Solo se conserva el texto extraído de este documento antiguo. Vuelve a cargar el original.',
    );
  const bytes = await readFile(join(root, doc.original.file)).catch(() => {
    throw new Error(
      'No se pudo leer el archivo original. Reemplaza el documento para recuperarlo.',
    );
  });
  if (digest(bytes) !== doc.sha256)
    throw new Error('El original no coincide con su hash. Reemplaza el documento antes de usarlo.');
  return bytes;
}
export async function retireEvidence(root: string, id: string) {
  z.string().uuid().parse(id);
  const doc = (await readEvidence(root)).find((d) => d.id === id);
  if (!doc) throw new Error('El documento ya no está en el baúl.');
  const trash = join(root, '.retirados');
  await mkdir(trash, { recursive: true, mode: 0o700 });
  await rename(join(root, `${id}.json`), join(trash, `${id}-${randomUUID()}.json`));
  if (doc.original)
    await rename(join(root, doc.original.file), join(trash, doc.original.file)).catch(() => {});
}
