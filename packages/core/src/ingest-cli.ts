import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { extractPdfPages, getTender, validateTenderId } from './ingest.js';

async function main() {
  const [id, pdfPath, sourceUrl] = process.argv.slice(2);
  if (!id || !pdfPath) {
    throw new Error('Uso: npm run ingest -- <id> <bases.pdf> [url-original]');
  }
  validateTenderId(id);
  if (sourceUrl && !['https:', 'http:'].includes(new URL(sourceUrl).protocol)) {
    throw new Error('La URL de origen debe usar HTTP o HTTPS.');
  }
  const config = loadConfig();
  const tender = await getTender(id, config.mercadoPublico.ticket);
  const bases = await extractPdfPages(pdfPath);
  const output = resolve('data/tenders', id);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'tender.json'), JSON.stringify(tender, null, 2) + '\n');
  await writeFile(
    resolve(output, 'bases.json'),
    JSON.stringify(
      {
        tenderId: id,
        sourceFile: resolve(pdfPath),
        sourceUrl: sourceUrl ?? null,
        ingestedAt: new Date().toISOString(),
        ...bases,
      },
      null,
      2,
    ) + '\n',
  );
  console.info(`${id}: ${bases.pageCount} páginas extraídas en ${output}`);
  if (bases.emptyPages.length) {
    console.warn(`Páginas sin texto (revisar si necesitan OCR): ${bases.emptyPages.join(', ')}`);
  }
  console.info(
    'Verifica que el PDF corresponda al ID indicado; la ingesta no valida esa asociación.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error de ingesta.');
  process.exitCode = 1;
});
