# Primera evaluación de desarrollo

Licitación histórica `730566-48-L123`; extracción de 66 candidatos del 27 de octubre
de 2026. Etiquetas y adjudicaciones **provisionales, pendientes de revisión del usuario**.
El documento ya se había usado para ajustar el extractor, por lo que esta muestra
no permite medir generalización a licitaciones nuevas.

| Medida                         | Resultado      | Alcance                                                  |
| ------------------------------ | -------------- | -------------------------------------------------------- |
| Cobertura estricta             | 24/34 · 70,6%  | Etiquetas completamente recuperadas                      |
| Cobertura incluyendo parciales | 30/34 · 88,2%  | Diagnóstico; no cuenta parciales como completos          |
| Precisión estricta auditada    | 19/25 · 76,0%  | Candidatos seleccionados cuyo significado se conserva    |
| Citas suficientes auditadas    | 10/25 · 40,0%  | Citas que respaldan todos los detalles de la descripción |
| Citas literales                | 66/66 · 100,0% | Coincidencia con texto de la página indicada             |
| Exclusiones respetadas         | 8/8 · 100,0%   | Casos negativos seleccionados                            |

Se revisaron semánticamente 25 de 66 candidatos: 19 correctos y 6 parciales. Los otros
41 no tienen auditoría semántica individual en esta muestra. Entre las 34 etiquetas
de referencia hay 24 recuperadas completamente, 6 parcialmente y 4 ausentes.

## Omisiones de la muestra

| Etiqueta | Contenido esperado                                                                  | Página física          |
| -------- | ----------------------------------------------------------------------------------- | ---------------------- |
| G05      | Cierre de ofertas: 13/11/2023 a las 17:00, fecha histórica                          | 4                      |
| G11      | Ponderación de experiencia: 10%                                                     | 6, con encabezado en 5 |
| G12      | Ponderación del precio: 80%                                                         | 6, con encabezado en 5 |
| G22      | Extender compromisos de integridad a empleados, asesores, agentes y subcontratistas | 15                     |

## Pérdidas de significado y de evidencia

`REQ-025` y `REQ-026` generalizan requisitos de personas jurídicas a cualquier adjudicatario
y omiten alternativas equivalentes de acreditación. `REQ-016` omite que el organismo
puede obtener la cartola SII si no se presenta. `REQ-050` omite la condición relativa a
la transferencia de la factura a terceros. `REQ-010` pierde condiciones del subcriterio
de discapacidad y `REQ-012` generaliza la documentación para pueblos indígenas.

Aunque las 66 citas coinciden con el texto, varias están cortadas o carecen de condiciones
relevantes. Por ejemplo, `REQ-031` describe un tope de multa de 10% que sí está en la
página, pero fuera de su cita. `REQ-059` cita el plazo y tipo de certificado, pero deja
fuera de la evidencia el supuesto de persona jurídica y los números de anexos.

## Ambigüedades conservadas

- A01: validez de oferta de 60 días desde adjudicación frente a 30 desde cierre (páginas 5 y 16).
- A02: subsanación de un día hábil frente a 24 horas (páginas 10 y 17).
- A03: antecedentes laborales solicitados después de adjudicación frente a Nota 1 que relaciona su omisión con inadmisibilidad en apertura (página 20).

Estas anotaciones describen diferencias del documento; no determinan su prevalencia.

## Prioridad del próximo ajuste

Primero, conservar condiciones y alternativas y seleccionar citas completas, incorporando
varias páginas de evidencia cuando sea necesario. Después, recuperar fechas y tablas
de ponderaciones y revisar las cuatro omisiones conocidas. Ejecutar la extracción otra
vez, adjudicar los nuevos candidatos y comparar con esta versión congelada.

Antes de informar métricas generales, ampliar el conjunto con licitaciones que no se
hayan usado para ajustar el prompt y revisar sus etiquetas. Procedimiento y límites
de reproducción en [README.md](README.md).
