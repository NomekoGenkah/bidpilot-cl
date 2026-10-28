import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { validateTenderId } from './ingest.js';
import { extractRequirements } from './requirements.js';

async function main() {
  const [id] = process.argv.slice(2);
  if (!id) throw new Error('Uso: npm run extract -- <id>');
  validateTenderId(id);
  const directory = resolve('data/tenders', id);
  const bases: unknown = JSON.parse(await readFile(resolve(directory, 'bases.json'), 'utf8'));
  if (
    typeof bases !== 'object' ||
    bases === null ||
    !('tenderId' in bases) ||
    bases.tenderId !== id
  ) {
    throw new Error('El ID de las bases no coincide con la licitación solicitada.');
  }
  const config = loadConfig();
  console.info('Se enviará el texto de las bases a Meta para extraer requisitos con citas.');
  const result = await extractRequirements(bases, config.meta, (message) => console.info(message));
  const output = resolve(directory, 'requirements.json');
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(result, null, 2) + '\n');
  await rename(temporary, output);
  console.info(
    `${result.requisitos.length} requisitos candidatos con cita verificada; ${result.rechazados.length} descartados.`,
  );
  console.info(`Resultado: ${output}`);
  console.info(
    'La coincidencia literal de una cita no valida la interpretación ni la cobertura; revisa el resultado.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error de extracción.');
  process.exitCode = 1;
});
