import { z } from 'zod';
import type { Config } from './config.js';

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({ content: z.string().nullable() }),
      }),
    )
    .min(1),
});

/** Una solicitud estructurada; los errores nunca incluyen credenciales ni cuerpos remotos. */
export async function metaJson(
  config: Config['meta'],
  messages: { role: 'developer' | 'user'; content: string }[],
  schema: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('La URL de Meta debe usar HTTPS y no contener credenciales ni parámetros.');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model: config.model,
          messages,
          max_completion_tokens: 16384,
          reasoning_effort: 'low',
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'requisitos',
              strict: true,
              schema,
            },
          },
        }),
      });
    } catch {
      if (attempt < 2) continue;
      throw new Error('No se pudo conectar con Meta (red o tiempo de espera).');
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const seconds = Number(response.headers.get('retry-after'));
      await response.body?.cancel();
      const delay =
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(seconds * 1000, 10_000)
          : 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) throw new Error(`Meta respondió HTTP ${response.status}.`);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Meta devolvió una respuesta no JSON.');
    }
    const completion = completionSchema.safeParse(data);
    const choice = completion.success ? completion.data.choices[0] : undefined;
    if (!choice) throw new Error('Meta devolvió una respuesta sin contenido válido.');
    if (choice.finish_reason !== 'stop') {
      throw new Error('Meta no completó la extracción; no se aceptará una respuesta truncada.');
    }
    if (choice.message.content === null) throw new Error('Meta devolvió contenido vacío.');
    try {
      return JSON.parse(choice.message.content) as unknown;
    } catch {
      throw new Error('El contenido devuelto por Meta no es JSON válido.');
    }
  }
  throw new Error('Se agotaron los intentos de conexión con Meta.');
}
