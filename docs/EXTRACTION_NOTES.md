# Extracción de requisitos con citas

## Ejecución

```bash
npm run extract -- 730566-48-L123
```

Lee `data/tenders/<id>/bases.json`, valida la secuencia de páginas y envía el texto
a Meta mediante Chat Completions con JSON Schema estricto. Procesa cuatro páginas
por bloque, con las páginas anterior y siguiente como contexto. Un requisito debe
tener su `paginaPrincipal` en el bloque objetivo y al menos una cita allí; puede
completar su evidencia con citas de las páginas de contexto disponibles.

Se usa `muse-spark-1.3` según `.env`, `reasoning_effort: low` y un límite de 16.384
tokens de generación por llamada, incluidos los de razonamiento. El cliente admite
hasta tres intentos ante fallos de red, HTTP 429 o errores 5xx; no reintenta HTTP 400.
Referencia de parámetros: [documentación oficial de Meta](https://dev.meta.ai/docs/protocols/chat-completions).

## Qué se verifica

- Estructura JSON y tipos mediante Zod; categoría, etapa y naturaleza tienen valores enumerados.
- Correspondencia literal de la cita con la página física indicada, normalizando Unicode NFC y espacios.
- Todas las citas deben ser válidas; una sola cita inválida impide aceptar el requisito.
- Condiciones de aplicación y alternativas son campos explícitos, además de conservarse en la descripción cuando corresponda.
- Un segundo intento de extracción cuando el esquema o las citas son inválidos.
- Las citas que siguen fallando se guardan en `rechazados`, fuera de los requisitos aceptados.
- Respuestas truncadas, contenido vacío o errores de API cancelan la ejecución; el resultado anterior permanece intacto.

La salida usa `schemaVersion: 2`, `promptVersion: requisitos-v3` y `citas[]` en lugar
de `cita`. Cada candidato incluye `condicionAplicacion` (texto o null) y
`alternativasAceptadas` (lista). Esos campos estructuran la interpretación del modelo;
el verificador literal no comprueba por sí solo su exactitud.

El resultado incluye el hash del PDF de la ingesta, el modelo, la fecha y los bloques
procesados. Se escribe en `requirements.json` mediante un archivo temporal y renombrado
al finalizar todos los bloques. Los resultados locales no se publican en Git.

## Primera prueba real del 27 de octubre de 2026 (salida v1)

Se procesaron las 23 páginas de `730566-48-L123`, en seis bloques. La ejecución v1
completa produjo **66 requisitos candidatos**, con 66 citas verificadas y ninguna
rechazada; cada bloque necesitó un solo intento. La suma de latencias HTTP fue
71,73 segundos y el uso reportado fue 45.654 tokens, contando entrada, salida y
razonamiento. Son datos de una ejecución, no un benchmark ni métricas de precisión.

Una comprobación posterior independiente volvió a cotejar las 66 citas con las páginas
y el hash de origen con el PDF descargado. La revisión puntual confirmó que se
incluyeron las renovaciones de Jira Software Standard y Power BI Connector for JIRA,
ambas para hasta 50 usuarios, citando las filas de la página física 3.

Los tests automatizados cubren citas inventadas o de otra página, páginas de contexto,
esquemas inválidos, HTTP 429/400, errores de red y respuestas truncadas, incluido
contenido nulo. Esa primera versión contaba con 18 tests en el repositorio.

## Límites de interpretación

Todos los resultados son **candidatos para revisión humana**. Una cita existente no
garantiza que la descripción sea una consecuencia correcta de ella. La clasificación
de etapa, naturaleza y categoría, y el identificador de cláusula, los propone el modelo;
el verificador no valida su semántica.

El prompt excluye obligaciones del organismo, derechos opcionales del proveedor e
instrucciones internas. Esta instrucción no sustituye la revisión humana. Hay una
evaluación provisional de desarrollo, todavía sin validación en documentos nuevos.
Puede haber duplicados
semánticos y condiciones que se extiendan entre páginas que el extractor no recupere.

En las bases históricas de prueba, las páginas físicas 5 y 16 indican condiciones
distintas para la validez de la oferta: 60 días desde la notificación de adjudicación
y 30 días desde el cierre de recepción. La extracción no decide cuál prevalece ni
reconcilia contradicciones. Deben revisarse las bases originales y sus aclaraciones.

## Comparación y siguiente validación

El prompt v3 conserva el esquema de salida v2 e incorpora instrucciones específicas
para heredar el sujeto de los encabezados, separar obligaciones con condiciones
distintas y distinguir puntajes de subcriterios, totales y ponderaciones. Estos cambios
responden a errores de la auditoría v2; todavía no tienen una adjudicación completa
ni métricas semánticas propias. Las cifras de `eval/V2.md` siguen correspondiendo al prompt v2.
La verificación literal no comprueba el cumplimiento semántico de estas instrucciones.

Prueba real del 28 de octubre de 2026 sobre el mismo documento: 66 candidatos,
104 fragmentos literales y ningún rechazado. La salida local se conservó en
`data/tenders/730566-48-L123/requirements.v3.json`, sin reemplazar `requirements.json`
ni su evaluación v2. Una revisión puntual encontró:

- `REQ-026` y `REQ-027` ya restringen los certificados al adjudicatario que no es
  persona natural, pero siguen sin citar el encabezado de la página 10: su evidencia
  todavía no respalda todo el alcance descrito.
- `REQ-047` conserva el Anexo 2 como obligación general; `REQ-048` separa la
  obligación condicional de quienes se unen para ofertar.
- `REQ-014` distingue los 20 puntos del subcriterio de género de los 100 del criterio
  agregado. Aún incluye una cita adicional del máximo agregado.
- `REQ-015` conserva una ponderación de 5% sin citar el encabezado de porcentajes.

Esta revisión puntual no constituye una auditoría de los 66 candidatos ni demuestra
una mejora global. Siguen pendientes la suficiencia de los encabezados, una revisión
completa y la validación con otra licitación antes de alimentar la matriz.

Ya hay una primera muestra provisional de 34 requisitos de este documento y una
auditoría semántica de 25 candidatos: [eval/BASELINE.md](../eval/BASELINE.md).
En la salida v1 la coincidencia literal fue 100%, pero solo 10 de las 25 citas auditadas
respaldaban todos los detalles de sus descripciones. La salida v2 conserva ambas
páginas cuando hace falta y recupera varias condiciones y alternativas. Resultados y
errores que permanecen: [eval/V2.md](../eval/V2.md). Antes de la matriz, revisar los
campos de alcance que siguen incompletos y validar en una licitación nueva.
