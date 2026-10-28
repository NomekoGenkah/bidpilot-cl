import { describe, expect, it, vi } from 'vitest';
import { buildMatrix, guardJudgment, type Judgment } from './matrix.js';
import { metaJson } from './meta.js';
import type { Evidence } from './evidence.js';
vi.mock('./meta.js', () => ({ metaJson: vi.fn() }));
const req = {
  id: 'REQ-001',
  descripcion: 'Presentar certificado de experiencia.',
  categoria: 'tecnica' as const,
  etapa: 'oferta' as const,
  naturaleza: 'obligacion' as const,
  paginaPrincipal: 1,
  condicionAplicacion: null,
  alternativasAceptadas: [],
  citas: [
    { pagina: 1, texto: 'El oferente debe presentar certificado de experiencia.', clausula: null },
  ],
};
const doc: Evidence = {
  id: 'd506a073-580d-4595-9ec3-f734bc1f67c8',
  name: 'Certificado ficticio',
  kind: 'texto',
  fictional: true,
  sha256: 'a',
  createdAt: '2026-10-28',
  pages: [{ page: 1, text: 'Certifica dos proyectos de desarrollo web.' }],
};
const good: Judgment = {
  requirementId: req.id,
  estado: 'cumple',
  sustentoBases: true,
  aplicabilidad: 'aplica',
  contradiccion: false,
  razon: 'El certificado acredita la experiencia solicitada.',
  pregunta: null,
  citasEvidencia: [{ documentId: doc.id, pagina: 1, texto: doc.pages[0]?.text ?? '' }],
};
describe('reglas de cumplimiento', () => {
  it('acepta evidencia literal suficiente y conserva las citas de ambas fuentes', () => {
    const result = guardJudgment(req, good, [doc], true);
    expect(result.estado).toBe('cumple');
    expect(result.pendienteRevision).toBe(false);
    expect(result.requisito.citas).toEqual(req.citas);
    expect(result.citasEvidencia[0]?.fictional).toBe(true);
  });
  it('impide cumplir sin documento, con cita inventada o página incorrecta', () => {
    expect(guardJudgment(req, good, [], true).estado).toBe('dudoso');
    for (const citation of [
      {
        ...good.citasEvidencia[0],
        documentId: doc.id,
        pagina: 2,
        texto: 'Certifica dos proyectos de desarrollo web.',
      },
      { documentId: doc.id, pagina: 1, texto: 'Certifica veinte proyectos inventados.' },
    ]) {
      const result = guardJudgment(req, { ...good, citasEvidencia: [citation] }, [doc], true);
      expect(result.estado).toBe('dudoso');
      expect(result.pendienteRevision).toBe(true);
      expect(result.citasEvidencia).toEqual([]);
    }
  });
  it('mantiene pendiente cuando falta el encabezado o falla la cita de bases', () => {
    expect(
      guardJudgment(req, { ...good, sustentoBases: false }, [doc], true).pendienteRevision,
    ).toBe(true);
    expect(guardJudgment(req, good, [doc], false).estado).toBe('dudoso');
  });
  it('no considera cumplimiento la contradicción ni una condición incierta o no aplicable', () => {
    expect(guardJudgment(req, { ...good, contradiccion: true }, [doc], true).estado).toBe('dudoso');
    for (const aplicabilidad of ['incierta', 'no_aplica'] as const)
      expect(
        guardJudgment(
          { ...req, condicionAplicacion: 'Si es persona jurídica' },
          { ...good, aplicabilidad },
          [doc],
          true,
        ).estado,
      ).toBe('dudoso');
  });
  it('permite falta sin evidencia, sin convertir ausencia en cumplimiento', () => {
    const result = guardJudgment(
      req,
      {
        ...good,
        estado: 'falta',
        citasEvidencia: [],
        pregunta: '¿Puedes adjuntar el certificado?',
      },
      [],
      true,
    );
    expect(result.estado).toBe('falta');
    expect(result.pregunta).toContain('certificado');
  });
  it('respeta una auditoría de bases insuficientes aunque el modelo proponga cumple', async () => {
    const bases = {
      tenderId: '730566-25-L124',
      sha256: 'a'.repeat(64),
      pageCount: 1,
      pages: [{ page: 1, text: req.citas[0]?.texto }],
    };
    vi.mocked(metaJson).mockResolvedValue({ resultados: [good] });
    const result = await buildMatrix(
      bases,
      { tenderId: bases.tenderId, sourceSha256: bases.sha256, requisitos: [req] },
      [doc],
      {},
      { apiKey: 'fake', model: 'fake', baseUrl: 'https://example.com' },
      () => {},
      [req.id],
    );
    expect(result.rows[0]?.estado).toBe('dudoso');
    expect(result.rows[0]?.pendienteRevision).toBe(true);
  });
  it('rechaza resultados duplicados y requisitos de otro documento', async () => {
    const bases = {
      tenderId: '730566-25-L124',
      sha256: 'a'.repeat(64),
      pageCount: 1,
      pages: [{ page: 1, text: req.citas[0]?.texto }],
    };
    const extraction = { tenderId: bases.tenderId, sourceSha256: bases.sha256, requisitos: [req] };
    const config = { apiKey: 'fake', model: 'fake', baseUrl: 'https://example.com' };
    vi.mocked(metaJson).mockResolvedValue({ resultados: [good, good] });
    await expect(buildMatrix(bases, extraction, [doc], {}, config)).rejects.toThrow(
      'exactamente un resultado',
    );
    await expect(
      buildMatrix(bases, { ...extraction, sourceSha256: 'b'.repeat(64) }, [doc], {}, config),
    ).rejects.toThrow('no corresponden');
  });
});
