import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Config } from './config.js';
import { digest, saveJson, readEvidence, searchEvidence, type Evidence } from './evidence.js';
import { extractPdfPages, getTender, validateTenderId } from './ingest.js';
import { extractRequirements, basesSchema } from './requirements.js';
import { buildMatrix, answersSchema, type Matrix, requirementsFileSchema } from './matrix.js';
import { buildSubmission } from './submission.js';
import { metaTool } from './meta.js';

export const runSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  tenderId: z.string(),
  mode: z.enum(['live', 'replay']),
  status: z.enum(['ready', 'running', 'awaiting_user', 'done', 'error']),
  phase: z.enum([
    'get_tender',
    'read_bases',
    'extract_requirements',
    'search_evidence',
    'check_requirements',
    'ask_user',
    'build_package',
    'done',
  ]),
  selectedEvidenceIds: z.array(z.string().uuid()),
  createdAt: z.string(),
  updatedAt: z.string(),
  questions: z.array(z.object({ requirementId: z.string(), question: z.string() })),
  deferred: z.array(z.string()),
  events: z.array(
    z.object({
      at: z.string(),
      tool: z.string(),
      kind: z.enum(['start', 'progress', 'done', 'pause', 'error', 'resume']),
      message: z.string(),
    }),
  ),
  error: z.string().nullable(),
});
export type AgentRun = z.infer<typeof runSchema>;
type ToolName = AgentRun['phase'];
export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, 'utf8')) as unknown;
export async function optionalJson(path: string) {
  try {
    return await readJson(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
export const readRun = async (dir: string) => {
  const raw = await optionalJson(join(dir, 'agent.json'));
  return raw ? runSchema.parse(raw) : null;
};
export async function selectedEvidence(dir: string, docs: Evidence[]) {
  const selection = await optionalJson(join(dir, 'selection.json'));
  if (!selection) return docs;
  const ids = z.array(z.string().uuid()).parse(selection);
  const selected = ids.map((id) => docs.find((d) => d.id === id));
  return selected.filter((d): d is Evidence => Boolean(d));
}
export async function createRun(
  dir: string,
  tenderId: string,
  bytes: Buffer | null,
  selectedIds: string[],
  mode: AgentRun['mode'] = 'live',
) {
  validateTenderId(tenderId);
  if (new Set(selectedIds).size !== selectedIds.length)
    throw new Error('Selección de evidencia duplicada.');
  if (
    bytes &&
    (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
  )
    throw new Error('Carga bases PDF válidas de hasta 8 MB.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (await readRun(dir))
    throw new Error('Esta licitación ya tiene un agente. Continúa el expediente existente.');
  if (bytes) {
    if (await optionalJson(join(dir, 'bases.json')))
      throw new Error('Las bases ya existen. Usa los datos ingeridos para continuar.');
    // Validar antes de iniciar llamadas remotas y conservar el original privado.
    const temp = join(dir, 'bases.upload.pdf');
    await writeFile(temp, bytes, { mode: 0o600 });
    try {
      await extractPdfPages(temp);
    } catch (error) {
      const { unlink } = await import('node:fs/promises');
      await unlink(temp);
      throw error;
    }
  } else {
    await access(join(dir, 'bases.json'));
    await access(join(dir, 'tender.json'));
  }
  const now = new Date().toISOString();
  const run: AgentRun = {
    schemaVersion: 1,
    id: randomUUID(),
    tenderId,
    mode,
    status: 'ready',
    phase: bytes ? 'get_tender' : 'extract_requirements',
    selectedEvidenceIds: selectedIds,
    createdAt: now,
    updatedAt: now,
    questions: [],
    deferred: [],
    events: [],
    error: null,
  };
  await saveJson(join(dir, 'selection.json'), selectedIds);
  await saveJson(join(dir, 'agent.json'), run);
  return run;
}
const descriptions: Record<ToolName, string> = {
  get_tender: 'Obtener los metadatos de Mercado Público para el ID solicitado.',
  read_bases: 'Leer las páginas físicas del PDF aportado y guardar su hash.',
  extract_requirements: 'Extraer requisitos con citas verificadas y checkpoints por bloque.',
  search_evidence: 'Buscar respaldo documental entre los documentos seleccionados.',
  check_requirements: 'Contrastar requisitos, evidencia y declaraciones con validación de citas.',
  ask_user: 'Pausar para solicitar aclaraciones o documentos al proveedor.',
  build_package: 'Componer recomendación, riesgos, brechas, checklist y borrador con trazabilidad.',
  done: 'Expediente preparado para revisión humana.',
};
export interface ReplayTools {
  tender: () => Promise<unknown>;
  extract: (bases: unknown) => Promise<unknown>;
  matrix: (
    bases: unknown,
    requirements: unknown,
    docs: Evidence[],
    answers: Record<string, string>,
  ) => Promise<Matrix>;
}
/** Herramientas con precondiciones locales; el modelo nunca decide rutas ni escribe archivos. */
export async function executeRun(
  dir: string,
  vault: string,
  config: Config | null,
  replay?: ReplayTools,
) {
  const run = await readRun(dir);
  if (!run) throw new Error('No existe el expediente del agente.');
  if (run.status === 'done' || run.status === 'awaiting_user') return run;
  if ((run.mode === 'replay') !== Boolean(replay))
    throw new Error('El modo del expediente no coincide con el servidor.');
  if (run.mode === 'live' && !config) throw new Error('Falta configurar Meta y Mercado Público.');
  const liveConfig = () => {
    if (!config) throw new Error('Falta configurar Meta.');
    return config;
  };
  const statePath = join(dir, 'agent.json');
  let saves = Promise.resolve();
  const event = (tool: string, kind: AgentRun['events'][number]['kind'], message: string) => {
    run.updatedAt = new Date().toISOString();
    run.events.push({ at: run.updatedAt, tool, kind, message });
    const snapshot = structuredClone(run);
    saves = saves.then(() => saveJson(statePath, snapshot));
    void saves.catch(() => {});
  };
  const docs = await selectedEvidence(dir, await readEvidence(vault));
  run.status = 'running';
  run.error = null;
  event(run.phase, 'resume', 'Preparación en curso. Se recuperan los pasos guardados.');
  try {
    if (docs.length !== run.selectedEvidenceIds.length)
      throw new Error(
        'Un documento seleccionado fue retirado. Revisa la selección antes de continuar.',
      );
    for (let step = 0; step < 9 && run.phase !== 'done'; step++) {
      const tool = run.phase;
      if (!replay && config) {
        const chosen = await metaTool(
          config.meta,
          JSON.stringify({
            licitacion: run.tenderId,
            fase: tool,
            resultados: run.events
              .filter((e) => e.kind === 'done')
              .map((e) => ({ herramienta: e.tool, resultado: e.message })),
          }),
          [{ name: tool, description: descriptions[tool] }],
        );
        if (chosen !== tool) throw new Error('La herramienta no satisface las precondiciones.');
      }
      event(tool, 'start', descriptions[tool]);
      await saves;
      const progress = (message: string) => event(tool, 'progress', message);
      const path = (name: string) => join(dir, name);
      if (tool === 'get_tender') {
        const tender = replay
          ? await replay.tender()
          : await getTender(run.tenderId, liveConfig().mercadoPublico.ticket);
        await saveJson(path('tender.json'), tender);
        run.phase = 'read_bases';
      } else if (tool === 'read_bases') {
        const bases = await extractPdfPages(path('bases.upload.pdf'));
        if (bases.pageCount > 200 || bases.pages.reduce((n, p) => n + p.text.length, 0) > 1_000_000)
          throw new Error('Las bases superan el límite de 200 páginas o un millón de caracteres.');
        await saveJson(path('bases.json'), {
          tenderId: run.tenderId,
          ingestedAt: new Date().toISOString(),
          ...bases,
        });
        run.phase = 'extract_requirements';
        progress(
          `${bases.pageCount} páginas leídas; ${bases.emptyPages.length} páginas sin texto. La asociación ID/PDF debe revisarse manualmente.`,
        );
      } else if (tool === 'extract_requirements') {
        const bases = basesSchema.parse(await readJson(path('bases.json')));
        const checkpoints = join(
          dir,
          'checkpoints',
          `extract-${bases.sha256}-v4-${digest(config?.meta.model ?? 'replay').slice(0, 16)}`,
        );
        await mkdir(checkpoints, { recursive: true, mode: 0o700 });
        // Una extracción preexistente validada se conserva para no invalidar sus auditorías.
        const existing = await optionalJson(path('requirements.json'));
        if (existing) {
          const parsed = requirementsFileSchema.parse(existing);
          if (parsed.sourceSha256 !== bases.sha256 || parsed.tenderId !== bases.tenderId)
            throw new Error('La extracción anterior no corresponde a las bases.');
        } else {
          const result = replay
            ? await replay.extract(bases)
            : await extractRequirements(bases, liveConfig().meta, progress, {
                load: (offset) => optionalJson(join(checkpoints, `${offset}.json`)),
                save: (offset, value) => saveJson(join(checkpoints, `${offset}.json`), value),
              });
          await saveJson(path('requirements.json'), result);
        }
        const accepted = requirementsFileSchema.parse(await readJson(path('requirements.json')));
        progress(
          `${accepted.requisitos.length} requisitos con citas. La literalidad no garantiza cobertura ni interpretación correcta.`,
        );
        run.phase = 'search_evidence';
      } else if (tool === 'search_evidence') {
        const reqs = requirementsFileSchema.parse(await readJson(path('requirements.json')));
        const results = reqs.requisitos.map((req) => ({
          requirementId: req.id,
          fragments: searchEvidence(docs, `${req.descripcion} ${req.condicionAplicacion ?? ''}`, 5),
        }));
        await saveJson(path('search.json'), {
          evidenceSha256: digest(JSON.stringify(docs)),
          results,
        });
        run.phase = 'check_requirements';
        progress(
          `Búsqueda en ${docs.length} documentos seleccionados. No encontrar respaldo no demuestra incumplimiento.`,
        );
      } else if (tool === 'check_requirements') {
        const bases = await readJson(path('bases.json'));
        const reqs = await readJson(path('requirements.json'));
        const parsed = requirementsFileSchema.parse(reqs);
        const answers = answersSchema.parse((await optionalJson(path('answers.json'))) ?? {});
        const known = z
          .array(z.string())
          .parse((await optionalJson(path('basis-review.json'))) ?? []);
        const checkpoints = join(dir, 'checkpoints', 'matrix');
        await mkdir(checkpoints, { recursive: true, mode: 0o700 });
        const cacheFile = (offset: number) => {
          const batch = parsed.requisitos.slice(offset, offset + 6);
          const key = digest(
            JSON.stringify({
              bases,
              batch,
              docs,
              answers: Object.fromEntries(batch.map((r) => [r.id, answers[r.id] ?? null])),
              known,
              version: 1,
              model: config?.meta.model,
            }),
          );
          return join(checkpoints, `${offset}-${key}.json`);
        };
        const matrix = replay
          ? await replay.matrix(bases, reqs, docs, answers)
          : await buildMatrix(bases, reqs, docs, answers, liveConfig().meta, progress, known, {
              load: (offset) => optionalJson(cacheFile(offset)),
              save: (offset, value) => saveJson(cacheFile(offset), value),
            });
        await saveJson(path('matrix.json'), matrix);
        progress(
          `Matriz: ${matrix.rows.filter((r) => r.estado === 'cumple').length} cumple, ${matrix.rows.filter((r) => r.estado === 'falta').length} falta, ${matrix.rows.filter((r) => r.estado === 'dudoso').length} dudoso. Resultados provisionales.`,
        );
        run.questions = matrix.rows
          .filter(
            (r) =>
              r.pregunta &&
              r.aplicabilidad !== 'no_aplica' &&
              !answers[r.requirementId] &&
              !run.deferred.includes(r.requirementId),
          )
          .sort(
            (a, b) =>
              Number(b.requisito.etapa === 'oferta') - Number(a.requisito.etapa === 'oferta') ||
              Number(b.contradiccion) - Number(a.contradiccion) ||
              Number(b.aplicabilidad === 'incierta') - Number(a.aplicabilidad === 'incierta'),
          )
          .slice(0, 6)
          .map((r) => ({
            requirementId: r.requirementId,
            question: r.pregunta ?? 'Revisar el antecedente pendiente.',
          }));
        run.phase = run.questions.length ? 'ask_user' : 'build_package';
      } else if (tool === 'ask_user') {
        run.status = 'awaiting_user';
        event(
          tool,
          'pause',
          `${run.questions.length} preguntas requieren tu decisión. Puedes responder, adjuntar evidencia o continuar dejando las brechas explícitas.`,
        );
        await saves;
        return run;
      } else if (tool === 'build_package') {
        const matrix = (await readJson(path('matrix.json'))) as Matrix;
        const tender = (await readJson(path('tender.json'))) as Record<string, unknown>;
        await saveJson(path('submission.json'), buildSubmission(matrix, tender));
        run.phase = 'done';
        run.status = 'done';
      }
      event(tool, 'done', `Completado: ${descriptions[tool]}`);
      await saves;
    }
    return run;
  } catch (error) {
    run.status = 'error';
    run.error =
      error instanceof Error && !(error instanceof z.ZodError)
        ? error.message
        : 'Respuesta inválida. Reintenta para continuar desde el progreso guardado.';
    event(run.phase, 'error', run.error);
    await saves;
    return run;
  }
}
export async function resumeRun(
  dir: string,
  answersInput: unknown,
  defer: boolean,
  selectedIds?: string[],
) {
  const run = await readRun(dir);
  if (!run) throw new Error('No existe el agente.');
  const answers = answersSchema.parse(answersInput);
  const rawRequirements = await optionalJson(join(dir, 'requirements.json'));
  const reqs = rawRequirements ? requirementsFileSchema.parse(rawRequirements) : { requisitos: [] };
  if (Object.keys(answers).some((id) => !reqs.requisitos.some((r) => r.id === id)))
    throw new Error('Respuesta para un requisito inexistente.');
  if (
    run.status === 'awaiting_user' &&
    !defer &&
    run.questions.some((q) => !answers[q.requirementId])
  )
    throw new Error('Responde las preguntas o elige continuar con pendientes.');
  const saved = answersSchema.parse((await optionalJson(join(dir, 'answers.json'))) ?? {});
  await saveJson(join(dir, 'answers.json'), { ...saved, ...answers });
  if (defer)
    run.deferred = [
      ...new Set([
        ...run.deferred,
        ...reqs.requisitos.filter((q) => !answers[q.id]).map((q) => q.id),
      ]),
    ];
  if (selectedIds) {
    if (new Set(selectedIds).size !== selectedIds.length)
      throw new Error('Selección de evidencia duplicada.');
    run.selectedEvidenceIds = selectedIds;
    await saveJson(join(dir, 'selection.json'), selectedIds);
  }
  run.questions = [];
  if (rawRequirements) run.phase = 'search_evidence';
  run.status = 'ready';
  run.error = null;
  run.events.push({
    at: new Date().toISOString(),
    tool: 'ask_user',
    kind: 'resume',
    message: `Se guardaron ${Object.keys(answers).length} respuestas. Las declaraciones no sustituyen evidencia documental.`,
  });
  await saveJson(join(dir, 'agent.json'), run);
  return run;
}
