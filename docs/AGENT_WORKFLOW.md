# Preparación de punta a punta

## Uso real

Ejecuta `npm start`, abre `http://127.0.0.1:3000` y guarda primero los documentos del
proveedor en Documentos. Pulsa **Nueva postulación**, ingresa el ID de Mercado Público,
carga las bases PDF y selecciona los documentos que podrá consultar el agente.
Confirma que el PDF corresponde al ID y autoriza el envío a Meta. La asociación entre
ID y PDF sigue siendo manual; consultar metadatos no autentica el archivo cargado.

Para una licitación ya ingerida por CLI, selecciónala y pulsa **Preparar paquete con
Meta**. Marca **Usar las bases ya ingeridas** y confirma la selección documental. No
se reemplazan automáticamente extracciones anteriores ni sus adjudicaciones.

El agente ejecuta herramientas locales con precondiciones:

1. `get_tender`: consulta metadatos de Mercado Público.
2. `read_bases`: conserva el PDF y extrae páginas físicas, incluidas las vacías.
3. `extract_requirements`: extrae requisitos con JSON Schema y verifica sus citas.
4. `search_evidence`: busca y guarda fragmentos por requisito, con hashes de las consultas y de los documentos seleccionados.
5. `check_requirements`: consume esa búsqueda guardada, verifica sus hashes y fragmentos, contrasta requisitos y declaraciones y valida citas.
6. `ask_user`: pausa para hasta seis preguntas prioritarias por ronda.
7. `build_package`: compone el paquete a partir de los resultados guardados.

En modo real, Meta solicita cada herramienta mediante `tools[].function` y
`message.tool_calls`. El controlador solo expone la herramienta habilitada para el
paso actual; controla el orden, las rutas y las escrituras. No es un planificador
abierto con acceso al sistema. La decisión semántica de qué falta y qué preguntar
procede del contraste estructurado. El historial resumido de pasos completados se
incluye en la siguiente selección de herramienta.

La API verificada admite `tool_choice: auto`; rechaza `required`. Se valida que la
respuesta pida exactamente la herramienta disponible, sin argumentos. Fallos de red,
429 y 5xx tienen reintentos acotados; un 400 se muestra como interrupción recuperable.

## Preguntas y recuperación

Las preguntas se guardan en disco. Puedes responder, añadir documentos al baúl,
cambiar la selección o pulsar **Continuar con pendientes**. Esta última decisión deja
las preguntas no contestadas como diferidas; no convierte brechas en cumplimiento.
Las respuestas son declaraciones, nunca sustitutos de certificados. Los textos sin enviar son borradores de la pestaña; guarda las respuestas antes de recargar.

El agente conserva `agent.json`, `selection.json`, el PDF cargado, metadatos,
bases, requisitos, resultados de búsqueda, respuestas, matriz y `submission.json`
en `data/tenders/<id>/`. Cada resultado JSON se guarda con temporal y renombrado.
La línea de tiempo y los estados de pausa sobreviven al cierre de la pestaña y al
reinicio del servidor.

Un reinicio marca el trabajo en ejecución como listo para continuar. No arranca
llamadas externas por sí solo. **Continuar desde el progreso guardado** recupera las
herramientas completadas y los bloques de extracción/contraste válidos. No hay
transacción de varios archivos: una herramienta interrumpida antes de guardar su
paso puede repetirse; los checkpoints evitan repetir bloques ya guardados.

Los bloques de extracción se vinculan al hash del PDF y versión de prompt. Los de
matriz incluyen bases, requisitos del bloque, documentos seleccionados, respuestas de
ese bloque, auditoría aplicada y modelo. Una respuesta invalida solo los bloques que
la contienen; cambiar evidencia invalida el contraste correspondiente. La matriz
anterior permanece guardada ante fallos.

Solo hay una ejecución activa por servidor. Mientras trabaja, las mutaciones desde
la API se bloquean. No ejecutes dos servidores sobre la misma carpeta de datos.

## Paquete y trazabilidad

La pestaña **Paquete** reúne:

- Recomendación: `no_go` para cierres de un día anterior al actual en Chile;
  `pendiente` si quedan brechas; `go_condicionado` si la matriz respalda provisionalmente
  todos los puntos aplicables. No determina admisibilidad ni garantiza puntajes.
- Riesgos contractuales/económicos y problemas de sustento o contradicción, con citas.
- Brechas y checklist de obligaciones, condiciones, alternativas y plazos documentales.
- Borrador técnico organizado por requisitos técnicos y criterios de evaluación,
  con antecedentes documentales citados y marcadores **POR COMPLETAR POR EL PROVEEDOR**.

El borrador se compone de evidencia ya contrastada. No se añaden credenciales,
metodologías, equipo, precios ni compromisos comerciales mediante redacción libre.
Si esos antecedentes no existen, debe completarlos el proveedor. Las citas literales
no demuestran autenticidad, vigencia ni suficiencia semántica definitiva.

Los plazos se conservan como texto de las bases. No se convierten plazos relativos
en fechas sin su evento inicial. La fecha de cierre de la API se identifica con su
campo de origen; las fechas sin zona no se interpretan como instantes UTC. Solo se
marca un cierre vencido cuando su día es anterior al día actual en Chile.

**Exportar → Carpeta con documentos** añade el paquete JSON/Markdown, recomendación,
riesgos, brechas, checklist, historial del agente y páginas de las bases. Incluye el
PDF cuando se cargó desde el navegador y su hash coincide. Los originales de evidencia
se incluyen solo según la selección explícita de exportación. El manifiesto registra
hashes de artefactos y documentos y los respaldos citados que se omitieron.

La exportación se bloquea si el agente no terminó, la matriz quedó obsoleta o el
paquete no corresponde al hash de la matriz. No se presenta nada en Mercado Público.

## Límites

Bases de hasta 8 MB, 200 páginas y un millón de caracteres; evidencia con los límites
anteriores del baúl. PDFs sin texto requieren trabajo externo; no hay OCR. La búsqueda
es léxica y puede perder sinónimos. La extracción puede omitir requisitos o interpretar
mal sus condiciones. Las auditorías semánticas existentes se aplican únicamente cuando
coincide el hash exacto de la extracción. El paquete no resuelve contradicciones de las
bases ni verifica la autenticidad de los documentos.

La persistencia sigue siendo JSON local. No se añadieron SQLite, alertas, comparación
de licitaciones, voz ni envío automático al portal.
