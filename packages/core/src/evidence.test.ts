import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { addEvidence, readEvidence, searchEvidence } from './evidence.js';
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
  expect(await readdir(directory)).toEqual([`${doc.id}.json`]);
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
  expect((await readdir(directory)).every((f) => f.endsWith('.json'))).toBe(true);
});
