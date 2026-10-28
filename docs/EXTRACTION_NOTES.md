# Extracción de requisitos con citas

## Ejecución

```bash
npm run extract -- 730566-48-L123
```

Lee `data/tenders/<id>/bases.json`, valida la secuencia de páginas y envía el texto
a Meta mediante Chat Completions con JSON Schema estricto. Procesa cuatro páginas
por bloque, con la página anterior como contexto. Esa página de contexto no puede
usarse como cita del bloque actual.

Se usa `muse-spark-1.3` según `.env`, `reasoning_effort: low` y un límite de 16.384
tokens de generación por llamada, incluidos los de razonamiento. El cliente admite
hasta tres intentos ante fallos de red, HTTP 429 o errores 5xx; no reintenta HTTP 400.
Referencia de parámetros: [documentación oficial de Meta](https://dev.meta.ai/docs/protocols/chat-completions).

## Qué se verifica

- Estructura JSON y tipos mediante Zod; categoría, etapa y naturaleza tienen valores enumerados.
- Correspondencia literal de la cita con la página física indicada, normalizando Unicode NFC y espacios.
- Un segundo intento de extracción cuando el esquema o las citas son inválidos.
- Las citas que siguen fallando se guardan en `rechazados`, fuera de los requisitos aceptados.
- Respuestas truncadas, contenido vacío o errores de API cancelan la ejecución; el resultado anterior permanece intacto.

El resultado incluye el hash del PDF de la ingesta, el modelo, la fecha y los bloques
procesados. Se escribe en `requirements.json` mediante un archivo temporal y renombrado
al finalizar todos los bloques. Los resultados locales no se publican en Git.

## Prueba real del 27 de octubre de 2026

Se procesaron las 23 páginas de `730566-48-L123`, en seis bloques. La última ejecución
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
contenido nulo. La suite completa del repositorio pasa 18 tests.

## Límites de interpretación

Todos los resultados son **candidatos para revisión humana**. Una cita existente no
garantiza que la descripción sea una consecuencia correcta de ella. La clasificación
de etapa, naturaleza y categoría, y el identificador de cláusula, los propone el modelo;
el verificador no valida su semántica.

El prompt excluye obligaciones del organismo, derechos opcionales del proveedor e
instrucciones internas. Esta instrucción no sustituye la revisión humana. No se han
medido precisión ni cobertura contra un conjunto etiquetado. Puede haber duplicados
semánticos y condiciones que se extiendan entre páginas que el extractor no recupere.

En las bases históricas de prueba, las páginas físicas 5 y 16 indican condiciones
distintas para la validez de la oferta: 60 días desde la notificación de adjudicación
y 30 días desde el cierre de recepción. La extracción no decide cuál prevalece ni
reconcilia contradicciones. Deben revisarse las bases originales y sus aclaraciones.

## Siguiente validación

Ya hay una primera muestra provisional de 34 requisitos de este documento y una
auditoría semántica de 25 candidatos: [eval/BASELINE.md](../eval/BASELINE.md).
La coincidencia literal fue 100%, pero solo 10 de las 25 citas auditadas respaldaban
todos los detalles de sus descripciones. Antes de la matriz de cumplimiento, corregir
la pérdida de condiciones y ampliar las citas; luego extender la evaluación a nuevas
licitaciones que no se hayan usado para ajustar el prompt.
