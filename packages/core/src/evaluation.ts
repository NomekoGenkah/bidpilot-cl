import { createHash } from 'node:crypto';
import { z } from 'zod';
import { basesSchema, requirementSchema } from './requirements.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const citation = z.object({
  pagina: z.number().int().positive(),
  texto: z.string().min(1),
  clausula: z.string().nullable(),
});
const labelSchema = z.object({
  schemaVersion: z.literal(1),
  tenderId: z.string(),
  sourceSha256: hash,
  pagesSha256: hash,
  status: z.literal('provisional_pendiente_revision'),
  split: z.literal('desarrollo'),
  requisitos: z
    .array(
      requirementSchema.omit({ cita: true }).extend({
        id: z.string(),
        citas: z.array(citation).min(1),
        nota: z.string(),
      }),
    )
    .min(1),
  exclusiones: z
    .array(
      z.object({ id: z.string(), descripcion: z.string(), motivo: z.string(), cita: citation }),
    )
    .min(1),
  ambiguedades: z.array(
    z.object({
      id: z.string(),
      descripcion: z.string(),
      goldIds: z.array(z.string()),
      citas: z.array(citation).min(1),
    }),
  ),
});
const reviewSchema = z.object({
  schemaVersion: z.literal(1),
  tenderId: z.string(),
  predictionSha256: hash,
  labelsSha256: hash,
  status: z.literal('provisional_pendiente_revision'),
  matches: z.array(
    z.object({
      goldId: z.string(),
      predictionIds: z.array(z.string()),
      veredicto: z.enum(['completo', 'parcial', 'ausente']),
      nota: z.string().min(1),
    }),
  ),
  audits: z
    .array(
      z.object({
        predictionId: z.string(),
        veredicto: z.enum(['correcto', 'parcial', 'incorrecto', 'fuera_alcance']),
        citaSuficiente: z.boolean(),
        nota: z.string().min(1),
      }),
    )
    .min(1),
  exclusions: z.array(
    z.object({
      exclusionId: z.string(),
      predictionIds: z.array(z.string()),
      nota: z.string().min(1),
    }),
  ),
});
const predictionSchema = z.object({
  tenderId: z.string(),
  sourceSha256: hash,
  requisitos: z.array(requirementSchema.extend({ id: z.string() })),
});
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const fraction = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  ratio: denominator ? numerator / denominator : null,
});

function unique(ids: string[], kind: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`IDs duplicados en ${kind}.`);
}

/** Calcula métricas de adjudicaciones explícitas; no infiere equivalencia semántica. */
export function evaluateExtraction(
  basesInput: unknown,
  labelsInput: unknown,
  predictionJson: string,
  reviewInput: unknown,
) {
  const bases = basesSchema.parse(basesInput);
  const labels = labelSchema.parse(labelsInput);
  const predictions = predictionSchema.parse(JSON.parse(predictionJson) as unknown);
  const review = reviewSchema.parse(reviewInput);
  const predictionHash = sha256(predictionJson);
  if (review.labelsSha256 !== sha256(JSON.stringify(labelsInput))) {
    throw new Error('Las etiquetas cambiaron; hay que actualizar la adjudicación semántica.');
  }
  if (review.predictionSha256 !== predictionHash)
    throw new Error(
      'La revisión no corresponde a esta extracción; hay que revisar los nuevos resultados.',
    );
  if ([labels, predictions, review].some((item) => item.tenderId !== bases.tenderId))
    throw new Error('Los IDs de licitación no coinciden.');
  if (
    labels.sourceSha256 !== bases.sha256 ||
    predictions.sourceSha256 !== bases.sha256 ||
    labels.pagesSha256 !== sha256(JSON.stringify(bases.pages))
  )
    throw new Error(
      'Las etiquetas o la extracción no corresponden al documento y texto de origen.',
    );

  const goldIds = labels.requisitos.map((item) => item.id);
  const predictionIds = predictions.requisitos.map((item) => item.id);
  const exclusionIds = labels.exclusiones.map((item) => item.id);
  unique(goldIds, 'etiquetas');
  unique(predictionIds, 'predicciones');
  unique(exclusionIds, 'exclusiones');
  unique(
    review.matches.map((item) => item.goldId),
    'cobertura',
  );
  unique(
    review.audits.map((item) => item.predictionId),
    'auditoría',
  );
  unique(
    review.exclusions.map((item) => item.exclusionId),
    'revisión de exclusiones',
  );
  unique(
    labels.ambiguedades.map((item) => item.id),
    'ambigüedades',
  );
  if (
    review.matches.length !== goldIds.length ||
    review.matches.some((item) => !goldIds.includes(item.goldId))
  )
    throw new Error('Se requiere una adjudicación por cada etiqueta de referencia.');
  if (
    review.exclusions.length !== exclusionIds.length ||
    review.exclusions.some((item) => !exclusionIds.includes(item.exclusionId))
  )
    throw new Error('Se requiere una revisión por cada exclusión.');
  for (const item of [...review.matches, ...review.exclusions]) {
    unique(item.predictionIds, 'referencias de una adjudicación');
    if (item.predictionIds.some((id) => !predictionIds.includes(id)))
      throw new Error('La revisión refiere predicciones inexistentes.');
  }
  if (review.audits.some((item) => !predictionIds.includes(item.predictionId)))
    throw new Error('La auditoría refiere predicciones inexistentes.');
  if (
    review.matches.some(
      (item) => (item.veredicto === 'ausente') !== (item.predictionIds.length === 0),
    )
  )
    throw new Error(
      'Una etiqueta ausente debe tener cero predicciones; las demás deben tener al menos una.',
    );
  if (labels.ambiguedades.some((item) => item.goldIds.some((id) => !goldIds.includes(id))))
    throw new Error('Una ambigüedad refiere etiquetas inexistentes.');

  const source = new Map(bases.pages.map((page) => [page.page, normalize(page.text)]));
  const hasCitation = (cita: z.infer<typeof citation>) => {
    const text = source.get(cita.pagina);
    return !!normalize(cita.texto) && text !== undefined && text.includes(normalize(cita.texto));
  };
  const citations = [
    ...labels.requisitos.flatMap((item) => item.citas),
    ...labels.exclusiones.map((item) => item.cita),
    ...labels.ambiguedades.flatMap((item) => item.citas),
  ];
  if (citations.some((cita) => !hasCitation(cita)))
    throw new Error('Una cita de referencia no existe en la página indicada.');
  const complete = review.matches.filter((item) => item.veredicto === 'completo');
  const partial = review.matches.filter((item) => item.veredicto === 'parcial');
  const missing = review.matches.filter((item) => item.veredicto === 'ausente');
  const auditedCorrect = review.audits.filter((item) => item.veredicto === 'correcto');
  return {
    schemaVersion: 1,
    tenderId: bases.tenderId,
    sourceSha256: bases.sha256,
    predictionSha256: predictionHash,
    status: labels.status,
    split: labels.split,
    metrics: {
      coberturaEstrictaMuestra: fraction(complete.length, goldIds.length),
      coberturaConParcialesMuestra: fraction(complete.length + partial.length, goldIds.length),
      precisionEstrictaMuestraAuditada: fraction(auditedCorrect.length, review.audits.length),
      citasSuficientesMuestraAuditada: fraction(
        review.audits.filter((item) => item.citaSuficiente).length,
        review.audits.length,
      ),
      citasLiteralesTodaExtraccion: fraction(
        predictions.requisitos.filter((item) => hasCitation(item.cita)).length,
        predictionIds.length,
      ),
      exclusionesRespetadasMuestra: fraction(
        review.exclusions.filter((item) => item.predictionIds.length === 0).length,
        exclusionIds.length,
      ),
    },
    counts: {
      gold: goldIds.length,
      predictions: predictionIds.length,
      audited: review.audits.length,
      complete: complete.length,
      partial: partial.length,
      missing: missing.length,
      ambiguities: labels.ambiguedades.length,
      unauditedPredictions: predictionIds.length - review.audits.length,
    },
    missing,
    partial,
    audits: review.audits,
    exclusions: review.exclusions,
    ambiguities: labels.ambiguedades,
    limitations: [
      'Muestra seleccionada de desarrollo de un documento ya usado para ajustar el extractor; no test ciego.',
      'Etiquetas y adjudicaciones provisionales pendientes de revisión del usuario.',
      'Cobertura sobre requisitos seleccionados; precisión sobre predicciones auditadas, no sobre toda la licitación.',
      'Los emparejamientos semánticos son adjudicaciones explícitas; el programa solo los valida y contabiliza.',
    ],
  };
}
