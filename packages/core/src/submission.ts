import type { Matrix } from './matrix.js';
import { digest } from './evidence.js';

/** El paquete compone información ya contrastada: no inventa ofertas ni compromisos. */
export function buildSubmission(matrix: Matrix, tender: Record<string, unknown>, now = new Date()) {
  const applicable = matrix.rows.filter(
    (r) => r.aplicabilidad !== 'no_aplica' || r.pendienteRevision,
  );
  const gaps = applicable.filter((r) => r.estado !== 'cumple' || r.pendienteRevision);
  const close = (tender.Fechas as Record<string, unknown> | undefined)?.FechaCierre;
  // La API entrega fechas sin zona. Solo declarar vencido cuando el día ya pasó en Chile.
  const chileDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(now);
  const closeDay =
    typeof close === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(close) ? close.slice(0, 10) : null;
  const expired = closeDay !== null && closeDay < chileDay;
  const recommendation = expired ? 'no_go' : gaps.length ? 'pendiente' : 'go_condicionado';
  const reference = (r: Matrix['rows'][number]) => ({
    requirementId: r.requirementId,
    bases: r.requisito.citas,
    evidencia: r.citasEvidencia,
    revisionPendiente: r.pendienteRevision,
  });
  const checklist = applicable
    .filter((r) => r.requisito.naturaleza === 'obligacion')
    .map((r) => ({
      ...reference(r),
      tarea: r.requisito.descripcion,
      etapa: r.requisito.etapa,
      estado: r.estado,
      condicion: r.requisito.condicionAplicacion,
      alternativas: r.requisito.alternativasAceptadas,
      // Conservar la expresión documental evita convertir plazos relativos en fechas inventadas.
      plazoDocumental:
        /\b(d[ií]as?|horas?|meses?|plazo|fecha|vigencia|cierre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/iu.test(
          r.requisito.citas.map((c) => c.texto).join(' '),
        )
          ? r.requisito.citas.map((c) => c.texto).join('\n')
          : null,
      fechaCalculada: null,
      accion:
        r.estado === 'cumple' && !r.pendienteRevision
          ? 'Revisar vigencia y autenticidad del respaldo antes de presentar.'
          : 'Completar o revisar este antecedente. No está acreditado íntegramente.',
    }));
  const technical = applicable.filter(
    (r) => r.requisito.categoria === 'tecnica' || r.requisito.naturaleza === 'criterio_evaluacion',
  );
  const proposal = technical.map((r) => {
    const supported = r.estado === 'cumple' && !r.pendienteRevision && r.citasEvidencia.length > 0;
    return {
      ...reference(r),
      titulo: r.requisito.descripcion,
      tipo:
        r.requisito.naturaleza === 'criterio_evaluacion'
          ? 'criterio_evaluacion'
          : 'alcance_tecnico',
      texto: supported
        ? `Para respaldar este punto se presentan los siguientes antecedentes documentales: ${r.citasEvidencia.map((c) => `«${c.texto}» (${c.documento ?? c.documentId}, página ${c.pagina}).`).join(' ')} Su vigencia y pertinencia deben confirmarse antes de presentar la oferta.`
        : '[POR COMPLETAR POR EL PROVEEDOR] Describir la solución ofrecida para este punto y adjuntar respaldo suficiente. No declarar cumplimiento mientras siga pendiente.',
      pendiente: !supported,
      condicion: r.requisito.condicionAplicacion,
      alternativas: r.requisito.alternativasAceptadas,
      puntajeGarantizado: false,
    };
  });
  const risks = applicable
    .filter(
      (r) =>
        r.pendienteRevision ||
        r.contradiccion ||
        r.requisito.categoria === 'contractual' ||
        r.requisito.categoria === 'economica',
    )
    .map((r) => ({
      ...reference(r),
      asunto: r.requisito.descripcion,
      motivo: r.pendienteRevision
        ? 'El sustento de las bases necesita revisión.'
        : r.contradiccion
          ? 'Hay antecedentes contradictorios.'
          : 'Revisar exposición económica, plazos y obligaciones antes de comprometerse.',
      prioridad: r.pendienteRevision || r.contradiccion ? 'alta' : 'revisar',
    }));
  return {
    schemaVersion: 1,
    tenderId: matrix.tenderId,
    createdAt: now.toISOString(),
    matrixSha256: digest(JSON.stringify(matrix)),
    sourceSha256: matrix.sourceSha256,
    fictional: matrix.fictional,
    requiresHumanReview: true,
    metodo: 'composicion_documental_sin_compromisos_inferidos',
    recomendacion: {
      decision: recommendation,
      razones: expired
        ? [
            'La fecha de cierre informada por Mercado Público corresponde a un día anterior al actual en Chile.',
          ]
        : gaps.length
          ? [
              `Hay ${gaps.length} requisitos aplicables o pendientes que aún no están íntegramente acreditados.`,
            ]
          : [
              'Los requisitos aplicables de la matriz tienen respaldo provisional. La revisión humana sigue siendo necesaria.',
            ],
      requirementIds: gaps.map((r) => r.requirementId),
      fechaCierre: typeof close === 'string' ? close : null,
      fuenteFecha:
        typeof close === 'string'
          ? 'Mercado Público · Fechas.FechaCierre (sin zona horaria declarada)'
          : null,
      fechaEvaluacion: now.toISOString(),
      limites:
        'No determina admisibilidad legal ni autenticidad de documentos. Una brecha documental no demuestra incumplimiento definitivo. No garantiza puntajes.',
    },
    brechas: gaps.map((r) => ({
      ...reference(r),
      descripcion: r.requisito.descripcion,
      razon: r.razon,
      pregunta: r.pregunta,
    })),
    riesgos: risks,
    checklist,
    propuesta: {
      titulo: `Borrador de propuesta técnica · ${matrix.tenderId}`,
      introduccion:
        'Propuesta para revisión del proveedor. Los antecedentes citados describen evidencia disponible; no constituyen una aceptación de condiciones ni un compromiso comercial nuevo.',
      secciones: proposal,
      pendientesGenerales: [
        'Completar identificación y firma del representante autorizado.',
        'Definir solución, metodología, equipo y calendario cuando no estén acreditados en los antecedentes.',
        'Completar precio y condiciones comerciales en los anexos exigidos por las bases.',
        'Revisar aclaraciones, vigencia de documentos y todos los puntos pendientes antes de presentar.',
      ],
    },
  };
}
export type Submission = ReturnType<typeof buildSubmission>;
const clean = (value: string) => value.replace(/([\\`*_{}[\]<>|])/gu, '\\$1');
export function submissionMarkdown(s: Submission) {
  const refs = (r: { bases: { pagina: number; texto: string }[] }) =>
    r.bases.map((c) => `> Bases, página ${c.pagina}: ${clean(c.texto).replace(/\n/gu, '\n> ')}`);
  return [
    `# Paquete de revisión · ${s.tenderId}`,
    '',
    s.fictional ? '**DEMOSTRACIÓN CON EVIDENCIA FICTICIA.**' : '',
    'No es asesoría legal. No se ha enviado ninguna postulación.',
    '',
    `## Recomendación: ${s.recomendacion.decision}`,
    ...s.recomendacion.razones.map(clean),
    `Cierre informado: ${s.recomendacion.fechaCierre ?? 'No disponible'}.`,
    s.recomendacion.limites,
    '',
    '## Riesgos',
    ...s.riesgos.flatMap((r) => [
      `### ${r.requirementId}: ${clean(r.asunto)}`,
      clean(r.motivo),
      ...refs(r),
      '',
    ]),
    '## Brechas',
    ...s.brechas.flatMap((r) => [
      `### ${r.requirementId}: ${clean(r.descripcion)}`,
      clean(r.razon),
      ...refs(r),
      '',
    ]),
    '## Checklist documental',
    ...s.checklist.flatMap((r) => [
      `- [ ] ${r.requirementId} · ${r.etapa}: ${clean(r.tarea)}`,
      `  ${r.accion}`,
      `  Plazo documental: ${r.plazoDocumental ? clean(r.plazoDocumental) : 'No identificado; revisar bases.'}`,
      ...refs(r),
      '',
    ]),
    `## ${s.propuesta.titulo}`,
    s.propuesta.introduccion,
    '',
    ...s.propuesta.secciones.flatMap((r) => [
      `### ${r.requirementId}: ${clean(r.titulo)}`,
      clean(r.texto),
      ...(r.condicion ? [`Condición: ${clean(r.condicion)}`] : []),
      ...r.alternativas.map((a) => `Alternativa: ${clean(a)}`),
      ...refs(r),
      '',
    ]),
    '### Por completar',
    ...s.propuesta.pendientesGenerales.map((p) => `- ${p}`),
    '',
    `Matriz SHA-256: ${s.matrixSha256}`,
    `Bases SHA-256: ${s.sourceSha256}`,
    '',
  ].join('\n');
}
