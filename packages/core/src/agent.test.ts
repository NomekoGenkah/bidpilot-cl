import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createRun, executeRun, readRun, readJson, resumeRun } from './agent.js';
import { demoId, demoPdf, demoEvidence, replayTools } from './replay.js';
import { addEvidence, digest, readEvidence, saveJson } from './evidence.js';
import { buildSubmission, submissionMarkdown, type Submission } from './submission.js';
import type { Matrix } from './matrix.js';
import { exportPackage } from './package-export.js';
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'bidpilot-agent-'));
  roots.push(root);
  const vault = join(root, 'evidence'),
    dir = join(root, 'tenders', demoId);
  const ids = [];
  for (const sample of demoEvidence)
    ids.push((await addEvidence(vault, sample.name, 'texto', Buffer.from(sample.text), true)).id);
  const unrelated = await addEvidence(
    vault,
    'Privado ajeno a esta postulación',
    'texto',
    Buffer.from('NO DEBE APARECER EN LA DEMO NI EN LA EXPORTACION.'),
    false,
  );
  await createRun(dir, demoId, await readFile(demoPdf), ids, 'replay');
  return { root, dir, vault, ids, unrelated };
}
it('completa PDF → citas → matriz → pausa persistida → respuestas → paquete sin red y con selección aislada', async () => {
  const { root, dir, vault, ids, unrelated } = await setup();
  const fetch = vi.fn(() => {
    throw new Error('La demo no puede usar la red.');
  });
  vi.stubGlobal('fetch', fetch);
  const tools = await replayTools();
  const first = await executeRun(dir, vault, null, tools);
  expect(first.status).toBe('awaiting_user');
  expect(first.questions).toHaveLength(3);
  expect((await readRun(dir))?.status).toBe('awaiting_user');
  await expect(resumeRun(dir, {}, false)).rejects.toThrow('Responde las preguntas');
  const answers = Object.fromEntries(
    first.questions.map((q) => [
      q.requirementId,
      'Declaración ficticia. Sigue pendiente el documento.',
    ]),
  );
  await resumeRun(dir, answers, false);
  const result = await executeRun(dir, vault, null, tools);
  expect(result.status).toBe('done');
  const matrix = (await readJson(join(dir, 'matrix.json'))) as Matrix;
  expect(matrix.rows.find((r) => r.requirementId === 'REQ-003')?.estado).toBe('falta');
  const submission = (await readJson(join(dir, 'submission.json'))) as Submission;
  expect(submission.recomendacion.decision).toBe('pendiente');
  expect(submission.propuesta.secciones.find((s) => s.requirementId === 'REQ-004')?.pendiente).toBe(
    true,
  );
  expect(submission.checklist.every((c) => c.fechaCalculada === null)).toBe(true);
  expect(submissionMarkdown(submission)).toContain('POR COMPLETAR');
  const destination = join(root, 'export');
  await mkdir(destination);
  const docs = (await readEvidence(vault)).filter((d) => ids.includes(d.id));
  const exported = await exportPackage(
    matrix,
    docs,
    answers,
    [ids[0] ?? ''],
    destination,
    vault,
    submission,
    result,
    await readJson(join(dir, 'bases.json')),
    await readFile(demoPdf),
  );
  const manifest = (await readJson(join(exported.path, 'contenido.json'))) as {
    files: { documentId: string }[];
    artifacts: { file: string; sha256: string }[];
  };
  expect(manifest.files).toHaveLength(1);
  expect(manifest.files.some((f) => f.documentId === unrelated.id)).toBe(false);
  for (const artifact of manifest.artifacts)
    expect(digest(await readFile(join(exported.path, artifact.file)))).toBe(artifact.sha256);
  expect(await readFile(join(exported.path, 'postulacion.md'), 'utf8')).toContain('DEMOSTRACIÓN');
  expect(fetch).not.toHaveBeenCalled();
});
it('recupera una herramienta interrumpida sin repetir extracción y permite continuar con brechas', async () => {
  const { dir, vault } = await setup();
  const replay = await replayTools(),
    extract = vi.fn(replay.extract);
  let broken = true;
  const tools = {
    ...replay,
    extract,
    matrix: vi.fn(async (...args: Parameters<typeof replay.matrix>) => {
      if (broken) throw new Error('Fallo simulado durante el contraste.');
      return replay.matrix(...args);
    }),
  };
  expect((await executeRun(dir, vault, null, tools)).status).toBe('error');
  expect((await readRun(dir))?.phase).toBe('check_requirements');
  broken = false;
  expect((await executeRun(dir, vault, null, tools)).status).toBe('awaiting_user');
  expect(extract).toHaveBeenCalledTimes(1);
  await resumeRun(dir, {}, true);
  expect((await executeRun(dir, vault, null, tools)).status).toBe('done');
  const original = await readFile(join(dir, 'submission.json'), 'utf8');
  expect((await executeRun(dir, vault, null, tools)).status).toBe('done');
  expect(await readFile(join(dir, 'submission.json'), 'utf8')).toBe(original);
});
it('no transforma documentos ausentes, fechas desconocidas o respuestas en acreditación ni en go', async () => {
  const { dir, vault } = await setup();
  await executeRun(dir, vault, null, await replayTools());
  const matrix = (await readJson(join(dir, 'matrix.json'))) as Matrix;
  const expired = buildSubmission(
    matrix,
    { Fechas: { FechaCierre: '2023-10-31T17:00:00' } },
    new Date('2026-10-31T16:00:00Z'),
  );
  expect(expired.recomendacion.decision).toBe('no_go');
  const undated = buildSubmission(matrix, {}, new Date('2026-10-31T16:00:00Z'));
  expect(undated.recomendacion.fechaCierre).toBeNull();
  expect(undated.recomendacion.decision).toBe('pendiente');
  // Una cita insuficiente prevalece incluso si una matriz manipulada afirma cumplir.
  const row = matrix.rows[0];
  if (!row) throw new Error('Falta fila');
  row.estado = 'cumple';
  row.pendienteRevision = true;
  expect(buildSubmission(matrix, {}).propuesta.secciones[0]?.pendiente).toBe(true);
  await writeFile(join(dir, 'bases.upload.pdf'), Buffer.from('PDF alterado'));
  await expect(createRun(dir, demoId, await readFile(demoPdf), [], 'replay')).rejects.toThrow(
    'ya tiene un agente',
  );
  await saveJson(join(dir, 'selection.json'), ['00000000-0000-4000-8000-000000000000']);
  await expect(executeRun(dir, vault, null, await replayTools())).resolves.toMatchObject({
    status: 'awaiting_user',
  });
});

it('rechaza reproducir bases alteradas o mezclar documentos propios con el escenario fijo', async () => {
  const { dir, vault, ids, unrelated } = await setup();
  const original = await readFile(demoPdf);
  await writeFile(
    join(dir, 'bases.upload.pdf'),
    Buffer.from(original.toString().replace('30 dias', '31 dias')),
  );
  expect((await executeRun(dir, vault, null, await replayTools())).status).toBe('error');
  const state = await readRun(dir);
  expect(state?.phase).toBe('extract_requirements');
  const { dir: otherDir, vault: otherVault, unrelated: otherDoc } = await setup();
  await executeRun(otherDir, otherVault, null, await replayTools());
  await resumeRun(otherDir, {}, true, [otherDoc.id]);
  expect((await executeRun(otherDir, otherVault, null, await replayTools())).status).toBe('error');
  expect(ids).not.toContain(unrelated.id);
});
