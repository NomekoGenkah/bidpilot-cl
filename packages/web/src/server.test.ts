import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { metaJson } from '../../core/src/meta.js';
vi.mock('../../core/src/meta.js', () => ({ metaJson: vi.fn() }));
const id = '730566-25-L124';
const quote = 'El proveedor deberá acreditar dos proyectos de desarrollo web.';
const req = {
  id: 'REQ-001',
  descripcion: 'Acreditar dos proyectos de desarrollo web.',
  categoria: 'tecnica',
  etapa: 'oferta',
  naturaleza: 'obligacion',
  paginaPrincipal: 1,
  condicionAplicacion: null,
  alternativasAceptadas: [],
  citas: [{ pagina: 1, texto: quote, clausula: null }],
};
let dir: string, origin: string, server: Server;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bidpilot-http-'));
  vi.stubEnv('BIDPILOT_DATA_DIR', dir);
  vi.stubEnv('META_API_KEY', 'test-secret');
  vi.stubEnv('META_API_BASE_URL', 'https://example.com/v1');
  vi.stubEnv('META_MODEL', 'test');
  vi.stubEnv('MERCADO_PUBLICO_TICKET', 'test');
  const tender = join(dir, 'tenders', id);
  await mkdir(tender, { recursive: true });
  await writeFile(join(tender, 'tender.json'), JSON.stringify({ Nombre: 'Prueba ficticia' }));
  await writeFile(
    join(tender, 'bases.json'),
    JSON.stringify({
      tenderId: id,
      sha256: 'a'.repeat(64),
      pageCount: 1,
      pages: [{ page: 1, text: quote }],
    }),
  );
  await writeFile(
    join(tender, 'requirements.json'),
    JSON.stringify({ tenderId: id, sourceSha256: 'a'.repeat(64), requisitos: [req] }),
  );
  server = (await import('./server.js')).server;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Puerto no disponible');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
async function post(path: string, data: unknown, requestOrigin = origin) {
  return fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
    body: JSON.stringify(data),
  });
}
async function waitJob() {
  for (let i = 0; i < 100; i++) {
    const job = (await (await fetch(origin + '/api/job')).json()) as { status: string };
    if (job.status !== 'running') return job.status;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('El trabajo no terminó');
}
it('recorre carga, búsqueda, generación, exportación, respuestas e invalidación por HTTP', async () => {
  expect((await fetch(origin + '/')).status).toBe(200);
  expect((await post('/api/evidence', {}, 'https://otro-sitio.example')).status).toBe(403);
  const forbiddenHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(origin + '/api/evidence', { headers: { Host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  expect(forbiddenHost).toBe(403);
  const upload = await post('/api/evidence', {
    name: 'Certificado ficticio',
    kind: 'texto',
    content: Buffer.from('Certifica dos proyectos de desarrollo web.').toString('base64'),
    fictional: true,
  });
  expect(upload.status).toBe(201);
  const document = (await upload.json()) as { id: string };
  const search = (await (await fetch(origin + '/api/search?q=proyectos')).json()) as unknown[];
  expect(search).toHaveLength(1);
  vi.mocked(metaJson).mockResolvedValue({
    resultados: [
      {
        requirementId: req.id,
        estado: 'cumple',
        sustentoBases: true,
        aplicabilidad: 'aplica',
        contradiccion: false,
        razon: 'El certificado respalda los dos proyectos.',
        pregunta: null,
        citasEvidencia: [
          {
            documentId: document.id,
            pagina: 1,
            texto: 'Certifica dos proyectos de desarrollo web.',
          },
        ],
      },
    ],
  });
  expect((await post(`/api/tenders/${id}/matrix`, {})).status).toBe(202);
  expect(await waitJob()).toBe('done');
  const state = (await (await fetch(origin + `/api/tenders/${id}/matrix`)).json()) as {
    stale: boolean;
    matrix: { rows: { estado: string }[] };
  };
  expect(state.stale).toBe(false);
  expect(state.matrix.rows[0]?.estado).toBe('cumple');
  const markdown = await fetch(origin + `/api/tenders/${id}/export?format=md`);
  expect(markdown.status).toBe(200);
  expect(await markdown.text()).toContain('Perfil ficticio');
  expect(
    (await post(`/api/tenders/${id}/answers`, { 'REQ-001': 'Aclaración no documental.' })).status,
  ).toBe(200);
  expect((await fetch(origin + `/api/tenders/${id}/export`)).status).toBe(409);
  const previous = await readFile(join(dir, 'tenders', id, 'matrix.json'), 'utf8');
  vi.mocked(metaJson).mockRejectedValue(new Error('Fallo remoto'));
  await post(`/api/tenders/${id}/matrix`, {});
  expect(await waitJob()).toBe('error');
  expect(await readFile(join(dir, 'tenders', id, 'matrix.json'), 'utf8')).toBe(previous);
  expect(
    (
      await post('/api/evidence', {
        name: 'Falso PDF',
        kind: 'pdf',
        content: Buffer.from('no PDF').toString('base64'),
        fictional: true,
      })
    ).status,
  ).toBe(400);
});

it('serializa generaciones y bloquea cambios durante el análisis', async () => {
  let finish: ((value: unknown) => void) | undefined;
  vi.mocked(metaJson).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  expect((await post(`/api/tenders/${id}/matrix`, {})).status).toBe(202);
  expect((await post(`/api/tenders/${id}/matrix`, {})).status).toBe(409);
  expect(
    (await post(`/api/tenders/${id}/answers`, { 'REQ-001': 'Cambiar durante el trabajo' })).status,
  ).toBe(409);
  if (!finish) throw new Error('No se inició el contraste');
  finish({
    resultados: [
      {
        requirementId: req.id,
        estado: 'falta',
        sustentoBases: true,
        aplicabilidad: 'aplica',
        contradiccion: false,
        razon: 'Falta documentación suficiente.',
        pregunta: '¿Puedes adjuntar más evidencia?',
        citasEvidencia: [],
      },
    ],
  });
  expect(await waitJob()).toBe('done');
  expect(
    (
      await post('/api/evidence', {
        name: 'Nueva evidencia ficticia',
        kind: 'texto',
        content: Buffer.from('Nuevo documento para revisar la experiencia.').toString('base64'),
        fictional: true,
      })
    ).status,
  ).toBe(201);
  const state = (await (await fetch(origin + `/api/tenders/${id}/matrix`)).json()) as {
    stale: boolean;
  };
  expect(state.stale).toBe(true);
  expect((await fetch(origin + `/api/tenders/${id}/export`)).status).toBe(409);
});
