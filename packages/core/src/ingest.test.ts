import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfPages, getTender, validateTenderId } from './ingest.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

// PDF mínimo propio: una página con texto y una página vacía.
function samplePdf() {
  const stream = 'BT /F1 12 Tf 72 720 Td (Requisito verificable) Tj ET';
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
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe('ingesta', () => {
  it('acepta IDs con tipos LR y L1 y rechaza rutas', () => {
    expect(validateTenderId('4301-70-LR26')).toBe('4301-70-LR26');
    expect(validateTenderId('730566-48-L123')).toBe('730566-48-L123');
    expect(() => validateTenderId('../licitacion')).toThrow('ID de licitación inválido');
  });

  it('conserva páginas vacías y el hash del PDF original para verificar citas', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bidpilot-'));
    directories.push(directory);
    const path = join(directory, 'bases.pdf');
    const bytes = samplePdf();
    await writeFile(path, bytes);
    const result = await extractPdfPages(path);
    expect(result.pages).toEqual([
      { page: 1, text: 'Requisito verificable' },
      { page: 2, text: '' },
    ]);
    expect(result.pageCount).toBe(2);
    expect(result.emptyPages).toEqual([2]);
    expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    await writeFile(path, '<html>Acceso denegado</html>');
    await expect(extractPdfPages(path)).rejects.toThrow('cabecera PDF válida');
  });

  it('rechaza errores de aplicación aunque la API responda HTTP 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            CodigoError: 10500,
            Mensaje: 'Ticket inválido',
          }),
        ),
      ),
    );
    await expect(getTender('4301-70-LR26', 'ticket')).rejects.toThrow('respuesta inválida');
  });

  it('no propaga URLs con el ticket en errores de red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('https://api.example/?ticket=secreto')),
    );
    await expect(getTender('4301-70-LR26', 'secreto')).rejects.toThrow(
      'No se pudo conectar con Mercado Público.',
    );
  });
});
