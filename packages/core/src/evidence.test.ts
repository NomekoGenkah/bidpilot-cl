import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  addEvidence,
  readEvidence,
  searchEvidence,
  originalBytes,
  retireEvidence,
} from './evidence.js';
let directory = '';
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('guarda texto UTF-8, busca páginas y no usa el nombre como ruta', async () => {
  directory = await mkdtemp(join(tmpdir(), 'bidpilot-vault-'));
  const doc = await addEvidence(
    directory,
    '../../privado.txt',
    'texto',
    Buffer.from('Experiencia verificable en desarrollo de software.'),
    true,
  );
  expect((await readEvidence(directory))[0]?.name).toBe('../../privado.txt');
  expect(searchEvidence([doc], 'software')[0]?.page).toBe(1);
  expect(searchEvidence([doc], 'inexistente')).toEqual([]);
  expect((await readdir(directory)).sort()).toEqual([`${doc.id}.json`, doc.original?.file].sort());
  expect(await originalBytes(directory, doc)).toEqual(
    Buffer.from('Experiencia verificable en desarrollo de software.'),
  );
  await expect(addEvidence(directory, 'vacío', 'texto', Buffer.from('  '))).rejects.toThrow(
    'texto UTF-8',
  );
  await expect(addEvidence(directory, 'binario', 'texto', Buffer.from([0xff]))).rejects.toThrow();
});
it('extrae PDF por página física y elimina temporales incluso cuando falla', async () => {
  directory = await mkdtemp(join(tmpdir(), 'bidpilot-vault-'));
  const stream = 'BT /F1 12 Tf 72 720 Td (Certificado ficticio verificable) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const doc = await addEvidence(
    directory,
    'Certificado ficticio.pdf',
    'pdf',
    Buffer.from(pdf),
    true,
  );
  expect(doc.pages).toEqual([
    { page: 1, text: 'Certificado ficticio verificable' },
    { page: 2, text: '' },
  ]);
  await expect(addEvidence(directory, 'Falso.pdf', 'pdf', Buffer.from('no PDF'))).rejects.toThrow(
    'cabecera',
  );
  expect((await readdir(directory)).some((f) => f.endsWith('.tmp'))).toBe(false);
  expect(await originalBytes(directory, doc)).toEqual(Buffer.from(pdf));
});

it('guarda adjuntos sin analizar, reemplaza de forma segura y retira sin usarlos en búsqueda', async () => {
  directory = await mkdtemp(join(tmpdir(), 'bidpilot-vault-'));
  const bytes = Buffer.from([0, 255, 3, 4]);
  const doc = await addEvidence(directory, 'Adjunto', 'archivo', bytes, true, 'contrato.docx');
  expect(doc.analysisStatus).toBe('sin_analizar');
  expect(doc.pages).toEqual([]);
  expect(await originalBytes(directory, doc)).toEqual(bytes);
  expect(
    searchEvidence([{ ...doc, pages: [{ page: 1, text: 'software ficticio' }] }], 'software'),
  ).toEqual([]);
  await expect(
    addEvidence(directory, 'Reemplazo', 'pdf', Buffer.from('no pdf'), true, 'a.pdf', doc.id),
  ).rejects.toThrow('cabecera');
  expect((await readEvidence(directory))[0]?.sha256).toBe(doc.sha256);
  const next = await addEvidence(
    directory,
    'Oferta',
    'texto',
    Buffer.from('Oferta actualizada verificable.'),
    true,
    'oferta.txt',
    doc.id,
  );
  expect(next.id).toBe(doc.id);
  expect(next.sha256).not.toBe(doc.sha256);
  expect(await readEvidence(directory)).toHaveLength(1);
  await retireEvidence(directory, doc.id);
  expect(await readEvidence(directory)).toEqual([]);
  expect((await readdir(join(directory, '.retirados'))).length).toBe(2);
});
