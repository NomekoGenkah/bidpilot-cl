import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'bidpilot-rehearsal-'));
const session = `bidpilot-rehearsal-${process.pid}`;
const port = process.env.REHEARSAL_PORT ?? '3102';
const origin = `http://127.0.0.1:${port}`;
const results: unknown[] = [];
const browser = async (...args: string[]) =>
  (
    await exec('agent-browser', ['--session', session, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 60_000,
    })
  ).stdout;
const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch {
      /* Servidor arrancando. */
    }
    await pause();
  }
  throw new Error('El estado esperado no llegó en 30 segundos.');
}
async function start(dir: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/demo.ts'], {
    env: { ...process.env, PORT: port, BIDPILOT_DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (b: Buffer) => {
    log += b.toString();
  });
  child.stderr.on('data', (b: Buffer) => {
    log += b.toString();
  });
  await until(
    async () => {
      if (child.exitCode !== null) throw new Error(log);
      return (await fetch(origin + '/api/settings')).json() as Promise<{ offline: boolean }>;
    },
    (s) => s.offline,
  );
  return child;
}
async function stop(child: ReturnType<typeof spawn>) {
  child.kill('SIGTERM');
  await once(child, 'exit');
}
try {
  for (let trial = 1; trial <= 3; trial++) {
    const dir = join(root, String(trial)),
      destination = join(dir, 'exports');
    await mkdir(destination, { recursive: true });
    let child = await start(dir);
    try {
      await browser('open', origin);
      await writeFile(join(dir, 'initial.txt'), await browser('snapshot', '-i'));
      await browser('click', '#replay-demo');
      const api = async () =>
        (await fetch(origin + '/api/tenders/990000-1-L126/agent')).json() as Promise<{
          run: { status: string; questions: { requirementId: string }[] };
          stale: boolean;
          submission: {
            recomendacion: { decision: string };
            propuesta: { secciones: { pendiente: boolean }[] };
          };
        }>;
      const waiting = await until(api, (s) => s.run?.status === 'awaiting_user');
      assert.equal(waiting.run.questions.length, 3);
      if (trial === 3) {
        await stop(child);
        child = await start(dir);
        await browser('open', origin);
        assert.equal((await api()).run.status, 'awaiting_user');
      }
      await browser('wait', '#agent-answers');
      await writeFile(join(dir, 'questions.txt'), await browser('snapshot', '-i'));
      if (trial !== 2) {
        const questions = trial === 1 ? waiting.run.questions : waiting.run.questions.slice(0, 1);
        for (const q of questions)
          await browser(
            'fill',
            `#agent-answer-${q.requirementId}`,
            'Declaración ficticia: este antecedente sigue pendiente, no está documentado.',
          );
      }
      await browser('click', trial === 1 ? '#agent-answers button[type=submit]' : '#agent-defer');
      const done = await until(api, (s) => s.run?.status === 'done' && !s.stale);
      assert.equal(done.submission.recomendacion.decision, 'pendiente');
      assert(done.submission.propuesta.secciones.some((s) => s.pendiente));
      await browser('wait', '#generate:not(:disabled)');
      await browser('click', '#tab-submission');
      await writeFile(join(dir, 'package.txt'), await browser('snapshot', '-i'));
      await browser('click', '.export-menu summary');
      await browser('click', '#exportfolder');
      await browser('wait', '#package-dialog[open]');
      await browser('fill', '#destination', destination);
      assert.equal((await browser('get', 'value', '#destination')).trim(), destination);
      if (trial === 2) await browser('uncheck', '#package-documents input:first-child');
      await browser('click', '#package-save');
      await browser('wait', '--text', 'Copia guardada:');
      const resultText = await browser('get', 'text', '#package-result');
      const path = /Copia guardada: (.+) \(\d+ documentos\)/u.exec(resultText)?.[1];
      assert(path);
      const manifest = JSON.parse(await readFile(join(path, 'contenido.json'), 'utf8')) as {
        files: { path: string; sha256: string }[];
        artifacts: { file: string; sha256: string }[];
        mode: string;
      };
      assert.equal(manifest.mode, 'replay');
      assert.equal(manifest.files.length, trial === 2 ? 1 : 2);
      for (const file of [
        ...manifest.files.map((f) => ({ file: f.path, sha256: f.sha256 })),
        ...manifest.artifacts,
      ])
        assert.equal(
          createHash('sha256')
            .update(await readFile(join(path, file.file)))
            .digest('hex'),
          file.sha256,
        );
      assert((await readFile(join(path, 'postulacion.md'), 'utf8')).includes('POR COMPLETAR'));
      await browser('click', '#package-close');
      if (trial === 3) await browser('set', 'viewport', '390', '844');
      assert.equal(
        (await browser('eval', 'document.documentElement.scrollWidth <= window.innerWidth')).trim(),
        'true',
      );
      await browser('screenshot', join(dir, 'package.png'));
      const a11y = await browser('a11y', '--json');
      await writeFile(join(dir, 'a11y.json'), a11y);
      const parsedA11y = JSON.parse(a11y) as {
        data?: { violations?: unknown[] };
        violations?: unknown[];
      };
      const violations = parsedA11y.violations ?? parsedA11y.data?.violations;
      assert(Array.isArray(violations), 'No se encontró resultado de accesibilidad');
      assert.equal(violations.length, 0);
      const errors = await browser('errors');
      assert(!errors.trim(), errors);
      await browser('open', origin);
      assert.equal((await api()).run.status, 'done');
      results.push({
        trial,
        status: 'passed',
        questions: 3,
        exportedDocuments: manifest.files.length,
        artifacts: manifest.artifacts.length,
        restartAtPause: trial === 3,
        viewport: trial === 3 ? '390x844' : '1280x720',
        a11yViolations: 0,
      });
      console.info(`Ensayo ${trial}/3 completado.`);
    } catch (error) {
      console.info(`Ensayo fallido; evidencia: ${dir}`);
      await writeFile(join(dir, 'failure.txt'), await browser('snapshot', '-i').catch(String));
      await browser('screenshot', join(dir, 'failure.png')).catch(() => {});
      throw error;
    } finally {
      await stop(child);
    }
  }
  await writeFile(
    join(root, 'results.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2) + '\n',
  );
  console.info(`Evidencia: ${root}`);
} finally {
  await browser('close').catch(() => {});
}
