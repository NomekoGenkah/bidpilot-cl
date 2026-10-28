# Encabezados y segunda licitación · 28 de octubre de 2026

## Qué cambió

El prompt `requisitos-v4` exige construir las citas antes de la descripción y repetir
el encabezado en cada requisito que dependa de él. El contexto anterior pasa de una
a dos páginas para recuperar encabezados de tablas. Se conserva `schemaVersion: 2`.
Un test comprueba que una cita dos páginas atrás se acepta como evidencia auxiliar,
sin convertir esa página en objetivo de extracción.

## Encabezados de la muestra original

La ejecución v4 de `730566-48-L123` aceptó 63 candidatos con 118 fragmentos y rechazó
cuatro candidatos por citas inválidas, incluso después del reintento. No se reemplazó
la extracción v2 ni se reutilizaron sus adjudicaciones.

`REQ-026` y `REQ-027` ahora citan expresamente «2.- Si el adjudicatario no es Persona
Natural:» en la página 10 y el certificado correspondiente en la 11. Conservan las
alternativas y sus condiciones. Esta evidencia faltaba en v3.

`REQ-015` aún omitió el encabezado porcentual y cortó las condiciones del párrafo.
Se completó mediante revisión documental en una copia local separada
`data/tenders/730566-48-L123/requirements.v4.reviewed.json`: se añadieron el
encabezado de la página 5 y el párrafo completo de la 7, y se retiró la afirmación de
máximo explícito no respaldada por sus citas. Todas las citas de esa copia vuelven a
coincidir literalmente. La salida automática permanece en `requirements.v4.json`.
Las tres entradas revisadas y los hashes de ambas copias están en
[headers-v4.json](reviews/730566-48-L123.headers-v4.json).

La corrección revisada no es una mejora automática garantizada ni una auditoría de
todos los candidatos. Persisten fallos de selección de citas, duplicados semánticos y
rechazos; no se atribuyen métricas globales nuevas a la muestra original.

## Segunda licitación

Se descargaron las [bases oficiales de 730566-25-L124](https://www.desarrollosocialyfamilia.gob.cl/transparencia/documentos/2024/SES/Abril/DAF/Adquisiciones/Bases_730566%2025%20L124%20dDAF%20512.pdf).
La página física 2 contiene el ID, que coincide con los metadatos obtenidos por API.
Son 23 páginas con texto. El hash del PDF es
`af6da1aa559592265a3d819f37ad090797c53c9b9eb139f36c5c036d4897df70`.

Antes de revisar la extracción se seleccionaron 12 requisitos de referencia y una
exclusión leyendo las páginas; no son un inventario exhaustivo. No se reajustó el
prompt después de ver los resultados. Sin embargo, el organismo y la plantilla son
similares a la muestra original: esto es una validación exploratoria, no una prueba
amplia de generalización. Etiquetas y adjudicaciones son provisionales.

La ejecución aceptó 63 candidatos, 105 fragmentos y ningún rechazado. El bloque 9–12
necesitó un reintento. Se revisaron semánticamente 16 candidatos seleccionados.

| Medida                         | Resultado                            | Denominador             |
| ------------------------------ | ------------------------------------ | ----------------------- |
| Cobertura completa             | 11/12 · 91,7%                        | Etiquetas seleccionadas |
| Cobertura incluyendo parciales | 12/12 · 100%                         | Etiquetas seleccionadas |
| Precisión estricta auditada    | 14/16 · 87,5%                        | Candidatos auditados    |
| Citas suficientes auditadas    | 12/16 · 75%                          | Candidatos auditados    |
| Citas literales                | 63/63 candidatos; 105/105 fragmentos | Toda la extracción      |
| Exclusión respetada            | 1/1                                  | Caso seleccionado       |

Los otros 47 candidatos no tienen auditoría semántica individual. Las cifras no son
comparables directamente con las de v2, cuyos documentos y muestras difieren.

Los certificados `REQ-023`/`REQ-024` citan su encabezado de persona no natural. Los
criterios porcentuales auditados incluyen el encabezado de la tabla. Aún hay errores:
`REQ-024` pierde la condición «en los casos que resulte procedente» en su alternativa;
`REQ-010` omite condiciones de cumplimiento alternativo y parte de su evidencia;
`REQ-008` y `REQ-016` no citan todos los datos de puntaje; `REQ-051` no cita el
encabezado que establece oferta económica. La literalidad no comprueba suficiencia.

## Reproducción

```bash
npm run ingest -- 730566-25-L124 fixtures/private/730566-25-L124/bases.pdf 'https://www.desarrollosocialyfamilia.gob.cl/transparencia/documentos/2024/SES/Abril/DAF/Adquisiciones/Bases_730566%2025%20L124%20dDAF%20512.pdf'
npm run extract -- 730566-25-L124
npm run eval -- 730566-25-L124
```

La evaluación reproduce la ejecución congelada local actual. Una extracción nueva
puede diferir y necesita su propia adjudicación; el hash impide reutilizar esta revisión
para otro resultado. El sufijo `.v2.json` de la revisión identifica el esquema de salida,
no el prompt. PDFs, texto completo y salidas permanecen fuera de Git.

Siguiente paso: incorporar revisión de suficiencia de evidencia al flujo antes de la
matriz, con estado explícito de pendiente cuando el alcance no queda sustentado.
