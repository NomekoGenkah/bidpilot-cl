import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';

const tenderSchema = z
  .object({
    CodigoExterno: z.string(),
    Nombre: z.string(),
    Descripcion: z.string(),
  })
  .passthrough();

export function validateTenderId(id: string): string {
  if (!/^\d+-\d+-[A-Z][A-Z0-9]{0,3}\d{2}$/.test(id)) {
    throw new Error('ID de licitación inválido; ejemplo: 730566-48-L123.');
  }
  return id;
}

/** Consulta metadatos; esta API no proporciona el PDF de las bases. */
export async function getTender(id: string, ticket: string) {
  validateTenderId(id);
  const url = new URL('https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json');
  url.searchParams.set('codigo', id);
  url.searchParams.set('ticket', ticket);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  } catch {
    // No propagar errores de red que puedan contener la URL con el ticket.
    throw new Error('No se pudo conectar con Mercado Público.');
  }
  if (!response.ok) throw new Error(`Mercado Público respondió HTTP ${response.status}.`);
  const result = z.object({ Listado: z.array(tenderSchema) }).safeParse(await response.json());
  if (!result.success) throw new Error('Mercado Público devolvió una respuesta inválida.');
  const tender = result.data.Listado.find((item) => item.CodigoExterno === id);
  if (!tender) throw new Error(`No se encontró la licitación ${id}.`);
  return tender;
}

/** Mantiene los índices físicos del PDF, empezando en 1, incluso en páginas sin texto. */
export async function extractPdfPages(path: string) {
  const bytes = await readFile(path);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('El archivo no tiene una cabecera PDF válida.');
  }
  const loading = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const document = await loading.promise;
    const pages: { page: number; text: string }[] = [];
    for (let page = 1; page <= document.numPages; page++) {
      const pdfPage = await document.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = content.items
        .map((item) => {
          if (!('str' in item)) return '';
          return item.str + (item.hasEOL ? '\n' : ' ');
        })
        .join('')
        .trim();
      pages.push({ page, text });
      pdfPage.cleanup();
    }
    if (!pages.some((page) => page.text.trim())) {
      throw new Error('El PDF no contiene texto extraíble; puede requerir OCR.');
    }
    return {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      pageCount: document.numPages,
      pages,
      emptyPages: pages.filter((page) => !page.text.trim()).map((page) => page.page),
    };
  } finally {
    await loading.destroy();
  }
}
