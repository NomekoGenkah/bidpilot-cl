# Evidencia y matriz local

## Recorrido

Ejecuta `npm start` en la raíz y abre `http://127.0.0.1:3000`. Selecciona una
licitación previamente ingerida y extraída. Se usan `bases.json`, `tender.json` y
`requirements.json` de `data/tenders/<id>/`; no se modifican las extracciones ni las
adjudicaciones del evaluador.

1. Guarda documentos PDF con texto, archivos UTF-8 o texto pegado en el baúl.
2. Busca términos para inspeccionar las páginas recuperadas.
3. Pulsa «Analizar con Meta» o «Actualizar con Meta». El proceso muestra su progreso por bloques.
4. Selecciona una fila de Matriz o Preguntas para revisar sus razones, condiciones y citas.
5. Responde las preguntas o carga nuevos documentos y vuelve a generar.
6. Usa Exportar para descargar JSON o Markdown cuando la matriz esté actualizada.

«Cargar perfil ficticio» añade tres documentos de demostración identificados como
ficticios: una oferta/perfil de Taller Sur SpA y dos declaraciones contradictorias de
experiencia. No representan certificados auténticos ni una empresa real. El botón
no duplica documentos con los mismos nombres. Si mezclas documentos ficticios con
reales, toda la matriz queda marcada como demostración; usa una carpeta de datos
separada para trabajar con otro proveedor.

## Persistencia y procedencia

- `data/evidence/<uuid>.json`: nombre, tipo, marca ficticia, hash SHA-256 del archivo
  original, fecha y texto por página física. Los nombres nunca se usan como rutas.
- Los PDFs de evidencia se procesan temporalmente y se eliminan; se conserva su texto,
  no el original. Guarda el PDF fuente por tu cuenta si necesitas cotejarlo después.
- `data/tenders/<id>/answers.json`: declaraciones del usuario por requisito.
- `data/tenders/<id>/matrix.json`: resultado, modelo, fecha, hashes de bases,
  requisitos, evidencia y respuestas, citas y motivos de revisión.

Los JSON se escriben mediante temporal y renombrado, con permisos privados. Un fallo
remoto o de validación no reemplaza la matriz anterior. Los cambios de documentos,
respuestas, requisitos o bases la marcan desactualizada y bloquean su exportación.
Los datos permanecen fuera de Git. La persistencia es JSON local; SQLite no forma
parte de este hito.

## Reglas del contraste

Cada bloque contiene hasta seis requisitos. Una búsqueda local por términos obtiene
hasta cinco fragmentos por requisito. Los fragmentos tienen hasta 4.000 caracteres,
con solapamiento, y conservan su página original. El envío se limita a esos fragmentos; un baúl pequeño puede quedar incluido completo. Las
consultas incluyen condiciones y los resultados conservan alternativas aceptadas.
El usuario activa el envío mediante el botón; se envían a Meta requisitos con citas,
fragmentos seleccionados y respuestas correspondientes.

Cuando existe una auditoría en `eval/reviews/<id>.v2.json` cuyo hash coincide
exactamente con el archivo de extracción, los candidatos marcados con citas
insuficientes quedan pendientes aunque el modelo diga lo contrario. Si cambia la
extracción, esa auditoría no se reutiliza. El conjunto aplicado se registra mediante
hash y un cambio invalida la matriz. La revisión previa es provisional.

El modelo evalúa si las propias citas del requisito sustentan todas sus afirmaciones,
antes de compararlo con los documentos. Su juicio de suficiencia es semántico y
falible. El código verifica además la literalidad contra las bases y documentos
locales, tolerando espacios y Unicode NFC. No comprueba autenticidad ni vigencia
externa de certificados.

- **Cumple:** juicio provisional con al menos una cita documental verificable.
- **Falta:** no se encontró respaldo suficiente en los fragmentos recuperados;
  no demuestra incumplimiento definitivo.
- **Dudoso:** ambigüedad, contradicción o aplicabilidad incierta/no aplicable.
- **Pendiente de revisión:** las citas de bases son insuficientes o inválidas, o se
  descartaron citas de evidencia inválidas. Siempre fuerza estado dudoso.

No aplicar un requisito no equivale a cumplirlo. Una declaración del usuario puede
aclarar aplicabilidad, pero el prompt prohíbe usarla como sustituto de un documento.
Una contradicción declarada por el modelo impide cumplir. Las citas válidas no
prueban que el modelo haya encontrado todas las contradicciones o interpretado bien
el texto. Los criterios de evaluación no se convierten en obligaciones universales
ni garantizan puntajes.

## Límites operativos

Solo un análisis a la vez por proceso; durante él se bloquean cambios desde la API.
La pestaña puede cerrarse y volver a abrirse mientras el servidor sigue funcionando.
Un reinicio del servidor interrumpe el trabajo; la matriz guardada se conserva y se
puede volver a generar. No hay cola persistente ni recuperación de bloques parciales.

Se admiten documentos de hasta 8 MB y 200.000 caracteres extraídos, con cuerpo HTTP
máximo de 12 MB. No hay OCR ni validación de firma digital. La búsqueda por términos
puede omitir evidencia con sinónimos o vocabulario diferente. Una respuesta vuelve a
contrastar la matriz completa, con el costo y tiempo correspondientes.

El servicio está pensado para localhost. Rechaza hosts ajenos a loopback y peticiones
con origen externo; no tiene usuarios ni autenticación para exponerlo a Internet.
No se envían postulaciones al portal. El paquete de propuesta y go/no-go quedan fuera
de este hito.

## Validación funcional del 28 de octubre de 2026

Se recorrió la interfaz con Chromium mediante `agent-browser`, usando el perfil
ficticio incluido y llamadas reales a Meta para las dos licitaciones disponibles.
Los resultados congelados se identifican por hash en
[eval/matrix-smoke/2026-10-28.json](../eval/matrix-smoke/2026-10-28.json).
Son pruebas funcionales, no mediciones de precisión semántica.

| Licitación     | Requisitos | Cumple | Falta | Dudoso | Pendientes dentro de dudoso |
| -------------- | ---------- | ------ | ----- | ------ | --------------------------- |
| 730566-48-L123 | 63         | 1      | 38    | 24     | 7                           |
| 730566-25-L124 | 63         | 1      | 36    | 26     | 5                           |

En Adobe se comprobaron estos casos:

- `REQ-049`: la oferta ficticia en pesos chilenos respalda el requisito de moneda.
- `REQ-002`: certificado Partner Gold ausente, resultado falta. Se respondió desde el
  formulario que no se dispone de él y se actualizó la matriz completa; siguió sin
  darse por cumplido. La respuesta se conservó tras recargar.
- `REQ-016`: las dos fechas de experiencia contradictorias producen dudoso; además,
  la insuficiencia registrada en la auditoría previa lo mantiene pendiente.
- `REQ-040`: la condición UTP no aplica al perfil, sin contarse como cumplimiento.
- `REQ-051`: la auditoría de la cita incompleta prevalece y fuerza pendiente, incluso
  cuando el modelo intenta darlo por suficiente.

En Jira/Power BI quedaron pendientes los seis candidatos marcados previamente con
citas insuficientes y uno adicional identificado en el contraste. Se comprobó el
filtro de pendientes y se activaron las exportaciones JSON/Markdown desde la interfaz.
Las exportaciones de Adobe respondieron HTTP 200 y conservaron las 63 filas, las
citas y la marca de perfil ficticio.

En un baúl separado se cargó un PDF propio ficticio por el selector de archivos y se
recuperó su texto mediante búsqueda, con página física 1. También se guardó texto
con marcas HTML sin interpretarlas como contenido ejecutable. Se inspeccionaron las
vistas de escritorio y móvil (390 px), corrigiendo el desbordamiento de filas largas.
El análisis de accesibilidad con axe no encontró infracciones en las vistas probadas;
no sustituye una evaluación manual completa.

`npm run check` verifica tipos, lint/formato y 39 tests. Incluyen extracción de PDF
con página vacía, persistencia y búsqueda de evidencia, citas inventadas o de otra
página, ausencia, contradicción, condiciones, respeto a auditorías previas y pruebas
HTTP de carga, exportación, respuestas, invalidación, concurrencia y conservación de
la matriz ante fallo remoto. Las evaluaciones anteriores de ambas extracciones
siguen reproduciendo sus resultados originales.

La organización de las secciones, los filtros y las ayudas «?» se describen en
[UI_REVIEW.md](UI_REVIEW.md).
