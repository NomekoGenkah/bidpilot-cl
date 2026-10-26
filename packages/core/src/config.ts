import { z } from 'zod';

const requerido = (nombre: string) =>
  z
    .string({ error: `falta ${nombre}` })
    .trim()
    .min(1, { error: `falta ${nombre}` });

const envSchema = z.object({
  META_API_KEY: requerido('META_API_KEY'),
  META_API_BASE_URL: requerido('META_API_BASE_URL').pipe(
    z.url({ error: 'META_API_BASE_URL debe ser una URL válida' }),
  ),
  META_MODEL: requerido('META_MODEL'),
  MERCADO_PUBLICO_TICKET: requerido('MERCADO_PUBLICO_TICKET'),
});

export interface Config {
  meta: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  mercadoPublico: {
    ticket: string;
  };
}

export class ConfigError extends Error {
  constructor(readonly problemas: string[]) {
    super(
      [
        'Configuración inválida:',
        ...problemas.map((p) => `  - ${p}`),
        'Copia .env.example a .env y completa los valores.',
      ].join('\n'),
    );
    this.name = 'ConfigError';
  }
}

/** Valida las variables de entorno y devuelve la configuración tipada. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = envSchema.safeParse(env);
  if (!resultado.success) {
    throw new ConfigError(resultado.error.issues.map((issue) => issue.message));
  }
  const e = resultado.data;
  return {
    meta: { apiKey: e.META_API_KEY, baseUrl: e.META_API_BASE_URL, model: e.META_MODEL },
    mercadoPublico: { ticket: e.MERCADO_PUBLICO_TICKET },
  };
}
