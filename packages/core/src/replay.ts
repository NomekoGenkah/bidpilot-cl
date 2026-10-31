import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { basesSchema, requirementSchema, verifyCitations } from './requirements.js';
import { guardJudgment, answersSchema, type Judgment } from './matrix.js';
import { digest } from './evidence.js';
import type { ReplayTools } from './agent.js';
export const demoId = '990000-1-L126';
export const demoPdf = fileURLToPath(
  new URL('../../../fixtures/public/demo/bases.pdf', import.meta.url),
);
export const demoEvidence = [
  {
    name: 'Demo · Antecedentes ficticios',
    text: 'EVIDENCIA FICTICIA. Taller de Ejemplo SpA declara dos proyectos de desarrollo web: Portal Vecinal y Biblioteca Abierta. Los proyectos incluyeron sitio web accesible y entrega de codigo fuente. Esta declaracion sintetica no es un certificado autentico.',
  },
  {
    name: 'Demo · Oferta ficticia',
    text: 'OFERTA FICTICIA. La oferta economica se expresa en pesos chilenos e incluye impuestos. No se ha definido el equipo, el precio ni el plan de trabajo. No se aporta certificado de vigencia de la sociedad.',
  },
];
export async function replayTools(): Promise<ReplayTools> {
  const pdfHash = digest(await readFile(demoPdf));
  const lines = (
    await readFile(new URL('../../../fixtures/public/demo/bases.txt', import.meta.url), 'utf8')
  ).split('\n');
  const requirements = lines
    .filter((line) => /^\d\./.test(line))
    .map((line, i) => ({
      id: `REQ-${String(i + 1).padStart(3, '0')}`,
      descripcion: line.slice(3),
      categoria:
        (
          [
            'tecnica',
            'evaluacion',
            'administrativa',
            'tecnica',
            'economica',
            'contractual',
          ] as const
        )[i] ?? 'tecnica',
      etapa: i === 5 ? ('ejecucion' as const) : ('oferta' as const),
      naturaleza: i === 1 ? ('criterio_evaluacion' as const) : ('obligacion' as const),
      paginaPrincipal: 1,
      condicionAplicacion: null,
      alternativasAceptadas: [],
      citas: [{ pagina: 1, texto: line, clausula: String(i + 1) }],
    }));
  return {
    tender: async () => ({
      CodigoExterno: demoId,
      Nombre: 'Demo ficticia · Desarrollo de sitio web',
      Descripcion: 'Proceso sintetico para ensayar el flujo. No es una licitacion real.',
      fictional: true,
    }),
    extract: async (input) => {
      const bases = basesSchema.parse(input);
      if (
        bases.sha256 !== pdfHash ||
        bases.tenderId !== demoId ||
        verifyCitations(requirements, bases.pages).rejected.length
      )
        throw new Error(
          'La reproducción solo admite las bases ficticias incluidas, sin modificaciones.',
        );
      return {
        schemaVersion: 2,
        promptVersion: 'replay-ficticio-v1',
        model: 'replay-sin-meta',
        tenderId: demoId,
        sourceSha256: pdfHash,
        requisitos: z.array(requirementSchema.extend({ id: z.string() })).parse(requirements),
        rechazados: [],
        bloques: [],
      };
    },
    matrix: async (bases, reqs, docs, answers) => {
      await (await replayTools()).extract(bases);
      if (
        docs.some(
          (doc) =>
            !doc.fictional ||
            !demoEvidence.some((sample) => digest(Buffer.from(sample.text)) === doc.sha256),
        )
      )
        throw new Error(
          'La demo solo admite los documentos ficticios incluidos. Usa un expediente real para tus documentos.',
        );
      const rows = requirements.map((req, i) => {
        const doc = docs.find((d) =>
          d.pages.some((p) => p.text.includes(i === 4 ? 'pesos chilenos' : 'dos proyectos')),
        );
        const supported = (i === 0 || i === 1 || i === 4) && Boolean(doc);
        const judgment: Judgment = {
          requirementId: req.id,
          estado: supported ? 'cumple' : 'falta',
          sustentoBases: true,
          aplicabilidad: 'aplica',
          contradiccion: false,
          razon: supported
            ? 'El antecedente ficticio contiene el respaldo de este punto. Resultado de reproducción, no juicio de Meta.'
            : 'No hay respaldo suficiente en los documentos ficticios seleccionados. La declaración del usuario no sustituye un documento.',
          pregunta:
            supported || answers[req.id]
              ? null
              : i === 2
                ? '¿Dispones del certificado de vigencia? Puedes indicar que sigue pendiente.'
                : i === 3
                  ? '¿Tienes un plan de trabajo documentado para los 30 dias?'
                  : '¿Has revisado la multa y su impacto antes de comprometerte?',
          citasEvidencia:
            supported && doc
              ? [{ documentId: doc.id, pagina: 1, texto: doc.pages[0]?.text ?? '' }]
              : [],
        };
        return guardJudgment(req, judgment, docs, true);
      });
      return {
        schemaVersion: 1,
        tenderId: demoId,
        createdAt: new Date().toISOString(),
        model: 'replay-sin-meta',
        sourceSha256: pdfHash,
        requirementsSha256: digest(JSON.stringify(reqs)),
        evidenceSha256: digest(JSON.stringify(docs)),
        answersSha256: digest(JSON.stringify(answersSchema.parse(answers))),
        basisReviewSha256: digest('[]'),
        fictional: true,
        requiresHumanReview: true,
        rows,
      };
    },
  };
}
