import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  addEvidence,
  readEvidence,
  saveJson,
  searchEvidence,
  digest,
  originalBytes,
  retireEvidence,
} from '../../core/src/evidence.js';
import { answersSchema, buildMatrix, matrixMarkdown, type Matrix } from '../../core/src/matrix.js';
import { packagePreview, exportPackage } from '../../core/src/package-export.js';
import { loadConfig } from '../../core/src/config.js';
import { validateTenderId } from '../../core/src/ingest.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  /* La configuración también puede venir del entorno. */
}
const data = process.env.BIDPILOT_DATA_DIR ?? join(root, 'data');
const vault = join(data, 'evidence');
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
let job: { tenderId: string; status: 'running' | 'done' | 'error'; message: string } | null = null;
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage) {
  const buffers: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const b = Buffer.from(chunk as Uint8Array);
    length += b.length;
    if (length > 12 * 1024 * 1024) throw new Error('La carga supera 12 MB.');
    buffers.push(b);
  }
  return JSON.parse(Buffer.concat(buffers).toString('utf8')) as unknown;
}
async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
async function optionalJson(path: string) {
  try {
    return await readJson(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
const tenderDir = (id: string) => join(data, 'tenders', validateTenderId(id));
async function inputs(id: string) {
  const dir = tenderDir(id);
  const [bases, requirements, evidence, savedAnswers] = await Promise.all([
    readJson(join(dir, 'bases.json')),
    readFile(join(dir, 'requirements.json'), 'utf8'),
    readEvidence(vault),
    optionalJson(join(dir, 'answers.json')),
  ]);
  const review = (await optionalJson(join(root, 'eval', 'reviews', `${id}.v2.json`))) as {
    predictionSha256: string;
    audits: { predictionId: string; citaSuficiente: boolean }[];
  } | null;
  const knownInsufficient =
    review?.predictionSha256 === digest(requirements)
      ? review.audits
          .filter((a) => !a.citaSuficiente)
          .map((a) => a.predictionId)
          .sort()
      : [];
  return {
    bases,
    requirements: JSON.parse(requirements) as unknown,
    evidence,
    answers: answersSchema.parse(savedAnswers ?? {}),
    knownInsufficient,
  };
}
async function matrixState(id: string) {
  const matrix = (await optionalJson(join(tenderDir(id), 'matrix.json'))) as Matrix | null;
  if (!matrix) return { matrix: null, stale: false };
  const current = await inputs(id);
  return {
    matrix,
    stale:
      matrix.basisReviewSha256 !== digest(JSON.stringify(current.knownInsufficient)) ||
      matrix.requirementsSha256 !== digest(JSON.stringify(current.requirements)) ||
      matrix.evidenceSha256 !== digest(JSON.stringify(current.evidence)) ||
      matrix.answersSha256 !== digest(JSON.stringify(current.answers)) ||
      matrix.sourceSha256 !== (current.bases as { sha256: string }).sha256,
  };
}
async function route(req: IncomingMessage, res: ServerResponse) {
  const authority = req.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(authority))
    return json(res, 403, { error: 'Host local requerido.' });
  if (req.headers.origin && req.headers.origin !== `http://${authority}`)
    return json(res, 403, { error: 'Origen no permitido.' });
  if (req.headers['sec-fetch-site'] === 'cross-site')
    return json(res, 403, { error: 'Solicitud de otro sitio rechazada.' });
  const url = new URL(req.url ?? '/', `http://${authority}`);
  const method = req.method ?? 'GET';
  if (method === 'GET' && ['/', '/app.js', '/style.css'].includes(url.pathname)) {
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    return res.end(await readFile(join(publicDir, file)));
  }
  if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Ruta no encontrada.' });
  if (method !== 'GET' && req.headers['content-type'] !== 'application/json')
    return json(res, 415, { error: 'Se requiere JSON.' });
  if (method !== 'GET' && job?.status === 'running')
    return json(res, 409, {
      error: 'Espera a que termine la matriz antes de cambiar documentos o respuestas.',
    });
  if (url.pathname === '/api/tenders' && method === 'GET') {
    await mkdir(join(data, 'tenders'), { recursive: true });
    const folders = await readdir(join(data, 'tenders'));
    const tenders = [];
    for (const id of folders) {
      try {
        const dir = tenderDir(id);
        const t = (await readJson(join(dir, 'tender.json'))) as { Nombre: string };
        const r = (await readJson(join(dir, 'requirements.json'))) as { requisitos: unknown[] };
        tenders.push({ id, name: t.Nombre, requirements: r.requisitos.length });
      } catch {
        /* Una ingesta incompleta no está lista para la matriz. */
      }
    }
    return json(res, 200, tenders);
  }
  if (url.pathname === '/api/evidence' && method === 'GET')
    return json(res, 200, await readEvidence(vault));
  if (url.pathname === '/api/search' && method === 'GET')
    return json(
      res,
      200,
      searchEvidence(await readEvidence(vault), url.searchParams.get('q') ?? ''),
    );
  if (url.pathname === '/api/evidence' && method === 'POST') {
    const input = z
      .object({
        name: z.string().min(1).max(180),
        kind: z.enum(['texto', 'pdf', 'archivo']),
        originalName: z.string().min(1).max(180).optional(),
        content: z.string().min(1),
        fictional: z.boolean(),
      })
      .strict()
      .parse(await body(req));
    return json(
      res,
      201,
      await addEvidence(
        vault,
        input.name,
        input.kind,
        Buffer.from(input.content, 'base64'),
        input.fictional,
        input.originalName,
      ),
    );
  }
  const evidenceMatch = /^\/api\/evidence\/([^/]+)\/(original|replace|remove)$/.exec(url.pathname);
  if (evidenceMatch?.[1]) {
    const evidenceId = z.string().uuid().parse(evidenceMatch[1]);
    const doc = (await readEvidence(vault)).find((d) => d.id === evidenceId);
    if (!doc) return json(res, 404, { error: 'Documento no disponible en el baúl.' });
    if (evidenceMatch[2] === 'original' && method === 'GET') {
      if (!doc.original)
        return json(res, 409, {
          error: 'Solo se conserva texto extraído. Vuelve a cargar el original.',
        });
      const bytes = await originalBytes(vault, doc);
      const inline = url.searchParams.get('inline') === '1' && doc.kind !== 'archivo';
      const filename = encodeURIComponent(doc.original.name).replaceAll("'", '%27');
      res.writeHead(200, {
        'Content-Type':
          doc.kind === 'pdf'
            ? 'application/pdf'
            : doc.kind === 'texto'
              ? 'text/plain; charset=utf-8'
              : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      return res.end(bytes);
    }
    if (evidenceMatch[2] === 'remove' && method === 'POST') {
      await retireEvidence(vault, evidenceId);
      return json(res, 200, { retired: true });
    }
    if (evidenceMatch[2] === 'replace' && method === 'POST') {
      const input = z
        .object({
          name: z.string().min(1).max(180),
          kind: z.enum(['texto', 'pdf', 'archivo']),
          originalName: z.string().min(1).max(180).optional(),
          content: z.string().min(1),
          fictional: z.boolean(),
        })
        .strict()
        .parse(await body(req));
      return json(
        res,
        200,
        await addEvidence(
          vault,
          input.name,
          input.kind,
          Buffer.from(input.content, 'base64'),
          input.fictional,
          input.originalName,
          evidenceId,
        ),
      );
    }
    return json(res, 405, { error: 'Método no permitido.' });
  }
  if (url.pathname === '/api/job' && method === 'GET') return json(res, 200, job);
  const match = /^\/api\/tenders\/([^/]+)\/(matrix|answers|export|package)$/.exec(url.pathname);
  if (!match?.[1]) return json(res, 404, { error: 'Ruta no encontrada.' });
  const id = validateTenderId(match[1]),
    action = match[2];
  if (action === 'answers' && method === 'GET')
    return json(res, 200, (await optionalJson(join(tenderDir(id), 'answers.json'))) ?? {});
  if (action === 'answers' && method === 'POST') {
    const answers = answersSchema.parse(await body(req));
    const current = await inputs(id);
    const ids = new Set(
      (current.requirements as { requisitos: { id: string }[] }).requisitos.map((r) => r.id),
    );
    if (Object.keys(answers).some((key) => !ids.has(key)))
      throw new Error('La respuesta no corresponde a un requisito.');
    await saveJson(join(tenderDir(id), 'answers.json'), answers);
    return json(res, 200, { saved: true });
  }
  if (action === 'matrix' && method === 'GET') return json(res, 200, await matrixState(id));
  if (action === 'matrix' && method === 'POST') {
    const config = loadConfig();
    const input = await inputs(id);
    job = { tenderId: id, status: 'running', message: 'Preparando contraste con Meta…' };
    const currentJob = job;
    void buildMatrix(
      input.bases,
      input.requirements,
      input.evidence,
      input.answers,
      config.meta,
      (message) => {
        currentJob.message = message;
      },
      input.knownInsufficient,
    )
      .then(async (matrix) => {
        await saveJson(join(tenderDir(id), 'matrix.json'), matrix);
        currentJob.status = 'done';
        currentJob.message = 'Matriz lista para revisión.';
      })
      .catch(() => {
        currentJob.status = 'error';
        currentJob.message =
          'No se pudo completar la matriz. Revisa la configuración y vuelve a intentarlo; la matriz anterior se conserva.';
      });
    return json(res, 202, job);
  }
  if (action === 'package' && (method === 'GET' || method === 'POST')) {
    const state = await matrixState(id);
    if (!state.matrix || state.stale)
      return json(res, 409, { error: 'Actualiza la matriz antes de exportar una carpeta.' });
    const current = await inputs(id);
    if (method === 'GET')
      return json(res, 200, { documents: packagePreview(state.matrix, current.evidence) });
    const input = z
      .object({
        destination: z.string().trim().min(1).max(4096),
        documentIds: z.array(z.string().uuid()).max(200),
      })
      .strict()
      .parse(await body(req));
    return json(
      res,
      201,
      await exportPackage(
        state.matrix,
        current.evidence,
        current.answers,
        input.documentIds,
        input.destination,
        vault,
      ),
    );
  }
  if (action === 'export' && method === 'GET') {
    const { matrix, stale } = await matrixState(id);
    if (!matrix || stale)
      return json(res, 409, { error: 'Genera una matriz actualizada antes de exportar.' });
    const markdown = url.searchParams.get('format') === 'md';
    res.writeHead(200, {
      'Content-Type': markdown ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="matriz-${id}.${markdown ? 'md' : 'json'}"`,
      'Cache-Control': 'no-store',
    });
    return res.end(markdown ? matrixMarkdown(matrix) : JSON.stringify(matrix, null, 2));
  }
  return json(res, 405, { error: 'Método no permitido.' });
}
let mutationQueue: Promise<unknown> = Promise.resolve();
export const server = createServer((req, res) => {
  const operation =
    req.method === 'GET' ? route(req, res) : mutationQueue.then(() => route(req, res));
  const handled = operation.catch((error: unknown) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    json(res, missing ? 404 : 400, {
      error: missing
        ? 'Archivo local no disponible. Completa la ingesta y extracción.'
        : error instanceof z.ZodError
          ? 'Datos inválidos. Revisa los campos enviados.'
          : error instanceof Error && !('code' in error)
            ? error.message
            : 'No se pudo procesar el archivo local.',
    });
  });
  if (req.method !== 'GET') mutationQueue = handled;
  void handled;
});
if (process.env.NODE_ENV !== 'test')
  server.listen(port, host, () => {
    console.info(`BidPilot CL en http://127.0.0.1:${port}`);
  });
