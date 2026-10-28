import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateExtraction } from './evaluation.js';
import { validateTenderId } from './ingest.js';

async function main() {
  const [id, predictionPath] = process.argv.slice(2);
  if (!id) throw new Error('Uso: npm run eval -- <id> [requirements.json]');
  validateTenderId(id);
  const [bases, labels, predictions, review] = await Promise.all([
    readFile(resolve('data/tenders', id, 'bases.json'), 'utf8'),
    readFile(resolve('eval/labels', `${id}.json`), 'utf8'),
    readFile(predictionPath ?? resolve('data/tenders', id, 'requirements.json'), 'utf8'),
    readFile(resolve('eval/reviews', `${id}.baseline.json`), 'utf8'),
  ]);
  const result = evaluateExtraction(
    JSON.parse(bases),
    JSON.parse(labels),
    predictions,
    JSON.parse(review),
  );
  await mkdir('data/eval', { recursive: true });
  const output = resolve('data/eval', `${id}.json`);
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.info(`Evaluación provisional: ${id}`);
  for (const [name, metric] of Object.entries(result.metrics)) {
    console.info(
      `${name}: ${metric.numerator}/${metric.denominator} (${metric.ratio === null ? 'sin datos' : (metric.ratio * 100).toFixed(1) + '%'})`,
    );
  }
  console.info(`Informe: ${output}`);
  console.info(
    'Muestra de desarrollo seleccionada; etiquetas y adjudicaciones pendientes de revisión del usuario.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error de evaluación.');
  process.exitCode = 1;
});
