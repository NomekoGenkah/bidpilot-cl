import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaJson } from './meta.js';
import { extractRequirements, requirementSchema, verifyCitations } from './requirements.js';

vi.mock('./meta.js', () => ({ metaJson: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const config = {
  apiKey: 'test-secret',
  baseUrl: 'https://api.example.com/v1',
  model: 'test-model',
};
const quote = 'El proveedor deberá acreditar dos proyectos de desarrollo web.';
const requirement = requirementSchema.parse({
  descripcion: 'Acreditar dos proyectos de desarrollo web.',
  categoria: 'tecnica',
  etapa: 'oferta',
  naturaleza: 'obligacion',
  paginaPrincipal: 1,
  condicionAplicacion: null,
  alternativasAceptadas: [],
  citas: [{ pagina: 1, texto: quote, clausula: null }],
});
const bases = {
  tenderId: '730566-48-L123',
  sha256: 'a'.repeat(64),
  pageCount: 1,
  pages: [{ page: 1, text: quote }],
};

describe('verificación de citas', () => {
  it('permite completar el sujeto y sus alternativas con citas de otra página disponible', () => {
    const condition =
      'Si el adjudicatario es persona jurídica, puede usar un documento equivalente.';
    const compound = {
      ...requirement,
      paginaPrincipal: 2,
      condicionAplicacion: 'Si es persona jurídica',
      alternativasAceptadas: ['Documento equivalente'],
      citas: [
        { pagina: 1, texto: condition, clausula: null },
        { pagina: 2, texto: quote, clausula: null },
      ],
    };
    const available = [
      { page: 1, text: condition },
      { page: 2, text: quote },
    ];
    expect(verifyCitations([compound], available, [{ page: 2, text: quote }]).accepted).toEqual([
      compound,
    ]);
    const invalid = {
      ...compound,
      citas: [...compound.citas, { pagina: 3, texto: quote, clausula: null }],
    };
    expect(verifyCitations([invalid], available).rejected).toHaveLength(1);
  });

  it('no acepta evidencia de contexto sin una cita en la página principal', () => {
    const withoutPrimary = { ...requirement, paginaPrincipal: 2 };
    expect(
      verifyCitations(
        [withoutPrimary],
        [
          { page: 1, text: quote },
          { page: 2, text: quote },
        ],
      ).rejected,
    ).toHaveLength(1);
  });

  it('tolera espacios y saltos de línea pero rechaza palabras inventadas y páginas equivocadas', () => {
    const changed = {
      ...requirement,
      citas: [{ pagina: 1, texto: quote.replace('dos', 'tres'), clausula: null }],
    };
    const wrongPage = { ...requirement, citas: [{ pagina: 2, texto: quote, clausula: null }] };
    const result = verifyCitations(
      [requirement, changed, wrongPage],
      [{ page: 1, text: quote.replaceAll(' ', '\n  ') }],
    );
    expect(result.accepted).toEqual([requirement]);
    expect(result.rejected).toHaveLength(2);
  });
});

describe('extracción de requisitos', () => {
  it('reintenta citas inválidas y conserva solo las respaldadas tras el segundo intento', async () => {
    const invalid = {
      ...requirement,
      citas: [{ pagina: 1, texto: 'Esta condición no está en las bases.', clausula: null }],
    };
    vi.mocked(metaJson).mockResolvedValue({ requisitos: [requirement, invalid] });
    const result = await extractRequirements(bases, config);
    expect(metaJson).toHaveBeenCalledTimes(2);
    expect(result.requisitos).toEqual([{ id: 'REQ-001', ...requirement }]);
    expect(result.rechazados).toHaveLength(1);
    expect(result.bloques[0]?.intentos).toBe(2);
    expect(result.sourceSha256).toBe(bases.sha256);
    expect(result.requiresHumanReview).toBe(true);
  });

  it('reintenta respuestas fuera del esquema', async () => {
    vi.mocked(metaJson)
      .mockResolvedValueOnce({ requisitos: [{ descripcion: 'incompleto' }] })
      .mockResolvedValueOnce({ requisitos: [requirement] });
    const result = await extractRequirements(bases, config);
    expect(result.requisitos).toHaveLength(1);
    expect(metaJson).toHaveBeenCalledTimes(2);
  });

  it('cancela si el segundo intento tampoco cumple el esquema', async () => {
    vi.mocked(metaJson).mockResolvedValue({ requisitos: 'inválido' });
    await expect(extractRequirements(bases, config)).rejects.toThrow('Esquema inválido');
  });

  it('no acepta como cita una página que solo se envió como contexto', async () => {
    const multi = {
      ...bases,
      pageCount: 5,
      pages: Array.from({ length: 5 }, (_, index) => ({ page: index + 1, text: quote })),
    };
    vi.mocked(metaJson)
      .mockResolvedValueOnce({ requisitos: [requirement] })
      .mockResolvedValue({
        requisitos: [
          {
            ...requirement,
            paginaPrincipal: 4,
            citas: [{ pagina: 4, texto: quote, clausula: null }],
          },
        ],
      });
    const result = await extractRequirements(multi, config);
    expect(result.requisitos).toHaveLength(1);
    expect(result.rechazados).toHaveLength(1);
    expect(result.bloques).toHaveLength(2);
  });

  it('no llama al modelo si faltan páginas o sus números están duplicados', async () => {
    await expect(extractRequirements({ ...bases, pageCount: 2 }, config)).rejects.toThrow();
    await expect(
      extractRequirements({ ...bases, pages: [{ page: 2, text: quote }] }, config),
    ).rejects.toThrow();
    expect(metaJson).not.toHaveBeenCalled();
  });
});
