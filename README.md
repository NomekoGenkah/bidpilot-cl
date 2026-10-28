# BidPilot CL

Agente que prepara postulaciones a licitaciones de [Mercado Público](https://www.mercadopublico.cl) (Chile): lee las bases, extrae los requisitos con su cita, los contrasta con tu evidencia y te deja un paquete de postulación casi listo para revisar.

> Proyecto en construcción para el Meta Global AI Developer Hackathon (pista Indie).

## Local-first

BidPilot CL corre en tu computador. Tus documentos y datos se guardan localmente (carpeta `data/`); lo único que sale de tu máquina son las llamadas al modelo de Meta y las consultas a la API de Mercado Público.

## Instalación

Requiere Node.js 20.16 o superior (por la extracción de PDF).

```bash
npm install
cp .env.example .env   # completa tus claves
npm start              # abre http://127.0.0.1:3000
```

Otros comandos: `npm run dev` (recarga automática), `npm test`, `npm run lint`, `npm run typecheck` y `npm run check` (los tres anteriores).

### Ingestar una licitación y sus bases

Descarga el PDF original y guárdalo en `fixtures/private/` (fuera de Git). Luego:

```bash
npm run ingest -- 730566-48-L123 fixtures/private/730566-48-L123/bases.pdf
```

Puedes añadir la URL de origen del PDF como tercer argumento. El comando carga `.env`,
consulta los metadatos de Mercado Público y guarda `tender.json` y `bases.json` en
`data/tenders/<id>/`. Las bases conservan el texto de cada página física (desde 1),
las páginas sin texto y el hash SHA-256 del PDF original. Verifica que el documento
corresponda al ID indicado: esa asociación se realiza manualmente.

La descarga de adjuntos del portal aún es manual. Los PDFs escaneados requieren OCR,
que todavía no está implementado. La ingesta no extrae requisitos ni los envía al modelo.

La primera prueba real y sus fuentes están documentadas en [docs/INGESTION_NOTES.md](docs/INGESTION_NOTES.md).

### Extraer requisitos con citas

Después de la ingesta:

```bash
npm run extract -- 730566-48-L123
```

Este comando **envía el texto de las bases a Meta**. Procesa bloques de cuatro páginas
y guarda el resultado en `data/tenders/<id>/requirements.json`. Cada requisito candidato tiene
categoría, etapa (oferta, adjudicación o ejecución), naturaleza (obligación o criterio
de evaluación), página principal, condiciones de aplicación, alternativas aceptadas
y una o varias citas textuales. La versión de salida actual es `schemaVersion: 2`.

El núcleo valida el JSON y comprueba todas las citas contra sus páginas, tolerando únicamente
diferencias de espacios y saltos de línea. Reintenta una vez los bloques con esquema
o citas inválidas; las citas que siguen fallando quedan en `rechazados`, fuera de la
lista de requisitos aceptados. Si una llamada falla o se trunca, conserva el resultado
anterior y no publica una extracción parcial.

Cada requisito debe tener una cita en su página principal, dentro del bloque objetivo.
Puede completar la evidencia con la página anterior o siguiente cuando allí estén un
encabezado, una condición o una continuación.

La coincidencia de una cita no garantiza que la interpretación sea correcta ni que
se hayan encontrado todos los requisitos. Revisa el resultado antes de usarlo.

Detalles de validación y límites: [docs/EXTRACTION_NOTES.md](docs/EXTRACTION_NOTES.md).

### Evaluar la extracción

```bash
npm run eval -- 730566-48-L123
```

La primera muestra incluye 34 requisitos clave y una auditoría de 25 candidatos.
El comando selecciona la revisión de la versión de salida, compara con adjudicaciones explícitas y genera un informe local sin llamar
al modelo. Las etiquetas son provisionales y la muestra es de desarrollo, no un test
ciego. Resultados, denominadores y reproducción en [eval/README.md](eval/README.md).
Comparación de la salida original y la versión 2: [eval/V2.md](eval/V2.md).

### Evidencia y matriz desde el navegador

Con una licitación ingerida y sus requisitos extraídos, ejecuta `npm start` y abre
http://127.0.0.1:3000. Guarda evidencia en texto/PDF, selecciona la licitación y pulsa
«Generar matriz con Meta». Revisa las citas, responde preguntas y exporta JSON o
Markdown. «Cargar perfil ficticio» permite probar con datos de demostración.

El texto seleccionado y las respuestas se envían a Meta al generar la matriz.
Los resultados son provisionales: citas insuficientes quedan pendientes de revisión
y no permiten afirmar cumplimiento. [Uso, persistencia y límites](docs/MATRIX_NOTES.md).

### Con Docker

```bash
cp .env.example .env   # completa tus claves
docker compose up --build
```

La interfaz queda en http://127.0.0.1:3000 y los datos locales se guardan en `./data`.

## Avisos

- **No es asesoría legal.** Revisa siempre las bases originales antes de postular.
- **Nunca envía nada al portal.** Tú revisas el paquete y postulas por tu cuenta.

## Estructura

```
packages/core   núcleo del agente (herramientas, bucle, esquemas), sin dependencia de la interfaz
packages/web    interfaz local servida en localhost
fixtures/       licitaciones de ejemplo (public/ se publica, private/ no)
eval/           set de evaluación
docs/           notas técnicas
```

## Herramientas de desarrollo

Parte del código de este repositorio se escribió con la ayuda de [Claude Code](https://claude.com/claude-code).

## Licencia

[MIT](LICENSE)
