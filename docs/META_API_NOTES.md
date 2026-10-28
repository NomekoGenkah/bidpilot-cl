# Notas sobre la Meta Model API

Documento de trabajo. Se completa a medida que verificamos cada punto con llamadas reales.

## Preguntas abiertas

### Autenticación y endpoints

- [x] Autenticación verificada: `Authorization: Bearer <META_API_KEY>`.
- [x] URL base `https://api.meta.ai/v1`; probado `POST /chat/completions`.
- [ ] ¿Es compatible con algún SDK existente (formato tipo OpenAI u otro)?
- [x] Modelo probado: `muse-spark-1.3` (no es un inventario de todos los disponibles).

### Tool use y salida estructurada

- [x] Tool use: formato `tools[].function` y respuesta `message.tool_calls`.
- [x] Salida estructurada con `response_format.type = "json_schema"` y `strict: true`: una prueba sintética exitosa; fiabilidad en bases reales pendiente.
- [ ] ¿Permite varias llamadas a herramientas en una sola respuesta?

### Límites de tasa

- [ ] Solicitudes y tokens por minuto.
- [ ] Comportamiento al exceder el límite (código de error, `Retry-After`).

### Ventana de contexto

- [ ] Tamaño de la ventana de contexto y máximo de tokens de salida.
- [ ] Latencia típica con bases de ~40 páginas.

### PDF e imágenes

- [ ] ¿Acepta PDF directamente?
- [ ] ¿Acepta imágenes (útil para bases escaneadas)? Formatos y tamaño máximo.

## Hallazgos

Verificado con llamadas reales el 27 de octubre de 2026:

| Prueba                   | Resultado                                                                                             | Latencia observada    |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------- |
| Conexión y autenticación | HTTP 200; respuesta `listo`                                                                           | 1,69 s                |
| Ciclo de herramienta     | Solicitud de `get_tender`, ejecución local con datos sintéticos y respuesta final usando el resultado | 3,38 s (dos llamadas) |
| Extracción estructurada  | JSON válido con requisito, página 3 y cita literal del texto sintético                                | 3,41 s                |

La API solo admitió `tool_choice: "auto"`. Una solicitud con herramienta forzada
por nombre respondió HTTP 400, indicando que `none`, `required` y las herramientas
por nombre no estaban soportadas. Diseñar el bucle con esta limitación.

Las mediciones son muestras individuales, no un benchmark. No se enviaron documentos
del proveedor ni bases reales durante estas pruebas. No se han verificado llamadas
paralelas, límites, PDFs, imágenes ni latencia con documentos largos.

Referencias oficiales: [inicio rápido](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions)
y [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions).

## Extracción sobre bases reales

Después de las pruebas sintéticas, se implementó `npm run extract -- <id>` y se envió
el texto de las 23 páginas de las bases históricas `730566-48-L123` a Meta. Se usa
JSON Schema estricto, `reasoning_effort: low` y `max_completion_tokens: 16384`.
Los requisitos candidatos se validan contra el texto de cada página antes de aceptarse.
Procedimiento, resultados y límites en [EXTRACTION_NOTES.md](EXTRACTION_NOTES.md).
