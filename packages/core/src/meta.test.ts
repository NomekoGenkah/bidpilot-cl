import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaJson } from './meta.js';

const config = {
  apiKey: 'test-secret',
  baseUrl: 'https://api.example.com/v1',
  model: 'test-model',
};
const messages = [{ role: 'user' as const, content: 'Texto de prueba.' }];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function success(finishReason = 'stop', content = '{"requisitos":[]}') {
  return new Response(
    JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }] }),
  );
}

describe('cliente de Meta', () => {
  it('reintenta un error de tasa y devuelve el JSON de una respuesta completa', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetch);
    const pending = metaJson(config, messages, {});
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ requisitos: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('respeta retry-after también al elegir herramienta', async () => {
    vi.useFakeTimers();
    const { metaTool } = await import('./meta.js');
    const toolAnswer = new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              tool_calls: [{ type: 'function', function: { name: 'read_bases', arguments: '{}' } }],
            },
          },
        ],
      }),
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503, headers: { 'retry-after': '7' } }))
      .mockResolvedValueOnce(toolAnswer);
    vi.stubGlobal('fetch', fetch);
    const pending = metaTool(config, 'Siguiente paso', [{ name: 'read_bases', description: 'x' }]);
    await vi.advanceTimersByTimeAsync(6_900);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toBe('read_bases');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un HTTP 400 ni expone el cuerpo remoto', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('test-secret', { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    await expect(metaJson(config, messages, {})).rejects.toThrow(/^Meta respondió HTTP 400\.$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rechaza contenido truncado aunque el fragmento sea JSON válido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success('length')));
    await expect(metaJson(config, messages, {})).rejects.toThrow('respuesta truncada');
  });

  it('identifica respuestas truncadas con contenido nulo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'length', message: { content: null } }],
          }),
        ),
      ),
    );
    await expect(metaJson(config, messages, {})).rejects.toThrow('respuesta truncada');
  });

  it('rechaza contenido no JSON y oculta errores de red con credenciales', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success('stop', 'test-secret')));
    await expect(metaJson(config, messages, {})).rejects.toThrow('no es JSON válido');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test-secret')));
    await expect(metaJson(config, messages, {})).rejects.toThrow(
      /^No se pudo conectar con Meta \(red o tiempo de espera\)\.$/,
    );
  });
});

it('usa herramientas nativas con auto y rechaza nombres, argumentos o respuestas truncadas', async () => {
  const { metaTool } = await import('./meta.js');
  const answer = (name = 'read_bases', args = '{ }', finish = 'tool_calls') =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: finish,
            message: { tool_calls: [{ type: 'function', function: { name, arguments: args } }] },
          },
        ],
      }),
    );
  const fetch = vi.fn().mockResolvedValue(answer());
  vi.stubGlobal('fetch', fetch);
  const available = [{ name: 'read_bases', description: 'Leer bases PDF' }];
  expect(await metaTool(config, 'Siguiente paso', available)).toBe('read_bases');
  const sent = JSON.parse(fetch.mock.calls[0]?.[1].body ?? '{}') as { tool_choice: string };
  expect(sent.tool_choice).toBe('auto');
  fetch.mockResolvedValue(answer('delete_files'));
  await expect(metaTool(config, 'Siguiente paso', available)).rejects.toThrow('no permitidos');
  fetch.mockResolvedValue(answer('read_bases', '{"path":"/etc/passwd"}'));
  await expect(metaTool(config, 'Siguiente paso', available)).rejects.toThrow();
  fetch.mockResolvedValue(answer('read_bases', '{}', 'length'));
  await expect(metaTool(config, 'Siguiente paso', available)).rejects.toThrow();
});
