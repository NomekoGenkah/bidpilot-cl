import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const envValido = {
  META_API_KEY: 'clave',
  META_API_BASE_URL: 'https://api.ejemplo.com/v1',
  META_MODEL: 'modelo',
  MERCADO_PUBLICO_TICKET: 'ticket',
};

describe('loadConfig', () => {
  it('devuelve la configuración tipada con un entorno válido', () => {
    expect(loadConfig(envValido)).toEqual({
      meta: { apiKey: 'clave', baseUrl: 'https://api.ejemplo.com/v1', model: 'modelo' },
      mercadoPublico: { ticket: 'ticket' },
    });
  });

  it('lista todas las variables faltantes o vacías', () => {
    const error = captura(() => loadConfig({ META_API_KEY: '  ', META_MODEL: 'modelo' }));
    expect(error.problemas).toEqual([
      'falta META_API_KEY',
      'falta META_API_BASE_URL',
      'falta MERCADO_PUBLICO_TICKET',
    ]);
    expect(error.message).toContain('Copia .env.example a .env');
  });

  it('rechaza una URL base inválida', () => {
    const error = captura(() => loadConfig({ ...envValido, META_API_BASE_URL: 'no-es-url' }));
    expect(error.problemas).toEqual(['META_API_BASE_URL debe ser una URL válida']);
  });
});

function captura(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('se esperaba un ConfigError');
}
