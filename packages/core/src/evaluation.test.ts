import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { evaluateExtraction } from './evaluation.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Fixture vacía.');
  return item;
}
function fixture() {
  const text = 'El proveedor deberá entregar su propuesta técnica en español.';
  const requirement = {
    descripcion: 'Presentar propuesta técnica en español.',
    categoria: 'tecnica',
    etapa: 'oferta',
    naturaleza: 'obligacion',
    cita: { pagina: 1, texto: text, clausula: null },
  };
  const bases = {
    tenderId: '730566-48-L123',
    sha256: 'a'.repeat(64),
    pageCount: 1,
    pages: [{ page: 1, text }],
  };
  const { cita, ...fields } = requirement;
  const gold = { ...fields, citas: [cita], nota: '' };
  const labels = {
    schemaVersion: 1,
    tenderId: bases.tenderId,
    sourceSha256: bases.sha256,
    pagesSha256: hash(JSON.stringify(bases.pages)),
    status: 'provisional_pendiente_revision',
    split: 'desarrollo',
    requisitos: ['G01', 'G02', 'G03'].map((id) => ({ ...gold, id })),
    exclusiones: [
      {
        id: 'N01',
        descripcion: 'Obligación del organismo.',
        motivo: 'organismo',
        cita: requirement.cita,
      },
    ],
    ambiguedades: [],
  };
  const predictionJson = JSON.stringify({
    tenderId: bases.tenderId,
    sourceSha256: bases.sha256,
    requisitos: ['REQ-001', 'REQ-002'].map((id) => ({ ...requirement, id })),
  });
  const review = {
    schemaVersion: 1,
    tenderId: bases.tenderId,
    predictionSha256: hash(predictionJson),
    labelsSha256: hash(JSON.stringify(labels)),
    status: labels.status,
    matches: [
      {
        goldId: 'G01',
        predictionIds: ['REQ-001'],
        veredicto: 'completo',
        nota: 'Caso sintético completo.',
      },
      {
        goldId: 'G02',
        predictionIds: ['REQ-002'],
        veredicto: 'parcial',
        nota: 'Caso sintético parcial.',
      },
      { goldId: 'G03', predictionIds: [], veredicto: 'ausente', nota: 'Caso sintético omitido.' },
    ],
    audits: [
      {
        predictionId: 'REQ-001',
        veredicto: 'correcto',
        citaSuficiente: true,
        nota: 'Caso sintético correcto.',
      },
      {
        predictionId: 'REQ-002',
        veredicto: 'parcial',
        citaSuficiente: false,
        nota: 'Caso sintético parcial.',
      },
    ],
    exclusions: [{ exclusionId: 'N01', predictionIds: [], nota: 'No extraído.' }],
  };
  return { bases, labels, predictionJson, review };
}

describe('evaluación de etiquetas y adjudicaciones', () => {
  it('separa cobertura completa/parcial, precisión auditada y coincidencia literal', () => {
    const f = fixture();
    const result = evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review);
    expect(result.metrics.coberturaEstrictaMuestra).toEqual({
      numerator: 1,
      denominator: 3,
      ratio: 1 / 3,
    });
    expect(result.metrics.coberturaConParcialesMuestra.ratio).toBe(2 / 3);
    expect(result.metrics.precisionEstrictaMuestraAuditada.ratio).toBe(1 / 2);
    expect(result.metrics.citasLiteralesTodaExtraccion.ratio).toBe(1);
    expect(result.metrics.citasSuficientesMuestraAuditada.ratio).toBe(1 / 2);
  });

  it('rechaza adjudicaciones reutilizadas después de cambiar extracción o etiquetas', () => {
    const f = fixture();
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson + '\n', f.review)).toThrow(
      'no corresponde a esta extracción',
    );
    first(f.labels.requisitos).descripcion = 'Un requisito de significado diferente.';
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review)).toThrow(
      'Las etiquetas cambiaron',
    );
  });

  it('detecta modificaciones del texto aunque se conserve el hash declarado del PDF', () => {
    const f = fixture();
    first(f.bases.pages).text += ' Texto añadido.';
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review)).toThrow(
      'texto de origen',
    );
  });

  it('valida que las citas de referencia existan en sus páginas', () => {
    const f = fixture();
    first(f.labels.requisitos).citas = [
      { pagina: 1, texto: 'Una cita inventada.', clausula: null },
    ];
    f.review.labelsSha256 = hash(JSON.stringify(f.labels));
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review)).toThrow(
      'cita de referencia',
    );
  });

  it('impide inflar métricas con auditorías duplicadas o referencias inexistentes', () => {
    const f = fixture();
    f.review.audits.push(first(f.review.audits));
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review)).toThrow(
      'IDs duplicados',
    );
    f.review.audits.pop();
    first(f.review.matches).predictionIds = ['REQ-999'];
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review)).toThrow(
      'predicciones inexistentes',
    );
  });

  it('exige revisar todas las etiquetas para que las ausentes entren en el denominador', () => {
    const f = fixture();
    f.review.matches.pop();
    expect(() => evaluateExtraction(f.bases, f.labels, f.predictionJson, f.review)).toThrow(
      'por cada etiqueta',
    );
  });
});
