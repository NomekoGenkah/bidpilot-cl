# BidPilot CL

Agente que prepara postulaciones a licitaciones de [Mercado Público](https://www.mercadopublico.cl) (Chile): lee las bases, extrae los requisitos con su cita, los contrasta con tu evidencia y te deja un paquete de postulación casi listo para revisar.

> Proyecto en construcción para el Meta Global AI Developer Hackathon (pista Indie).

## Local-first

BidPilot CL corre en tu computador. Tus documentos y datos se guardan localmente (carpeta `data/`); en modo real se envían a Meta las bases, los fragmentos de evidencia seleccionada y las respuestas necesarias para el análisis, y se consultan metadatos de Mercado Público. El modo de reproducción no llama a esas APIs.

## Instalación

Usa Node.js 24 LTS, la versión verificada para ejecutar y comprobar el proyecto.

```bash
npm install
cp .env.example .env   # completa tus claves
npm start              # abre http://127.0.0.1:3000
```

Otros comandos: `npm run dev` (recarga automática), `npm test`, `npm run lint`, `npm run typecheck` y `npm run check` (los tres anteriores).

### Preparar una postulación desde el navegador

1. Guarda la evidencia del proveedor en **Documentos** (PDF con texto, archivos UTF-8 o texto pegado).
2. Pulsa **Nueva postulación**, ingresa el ID, carga sus bases PDF y selecciona la evidencia.
3. Confirma la asociación ID/PDF y el envío a Meta. El agente encadena lectura, extracción con citas, búsqueda y matriz; su línea de tiempo conserva las acciones.
4. Responde sus preguntas o continúa dejando pendientes explícitos. Puedes añadir documentos y cambiar la selección antes de continuar.
5. Revisa **Paquete**: recomendación, riesgos, brechas, checklist y borrador técnico alineado con los requisitos y criterios de evaluación.
6. Exporta una carpeta con el paquete, sus citas y los originales que selecciones. Revisa todo antes de postular por tu cuenta.

Los pasos y bloques validados se conservan al cerrar la pestaña o reiniciar el servidor.
El borrador usa antecedentes documentales y marca lo que el proveedor debe completar;
no inventa equipo, credenciales, precios ni compromisos. Los plazos relativos no se
convierten en fechas sin su evento inicial. [Funcionamiento y límites](docs/AGENT_WORKFLOW.md).

### Demo sin claves ni llamadas externas

```bash
npm ci
npm run demo
```

Abre http://127.0.0.1:3000 y pulsa **Probar demo sin Meta**. Incluye bases y evidencia
**ficticias**, resultados de reproducción identificados y el recorrido completo hasta
la exportación. Guarda sus datos en `data/demo/`, separados del uso normal. No evalúa
la calidad de Meta. [Guion, reproducción y límites](docs/DEMO.md).

### Uso avanzado por CLI y evaluaciones

La ingesta y extracción por CLI siguen disponibles:

```bash
npm run ingest -- 730566-48-L123 fixtures/private/730566-48-L123/bases.pdf
npm run extract -- 730566-48-L123
npm run eval -- 730566-48-L123
```

La descarga de bases desde el portal es manual; puedes cargarlas directamente desde
el navegador. La extracción conserva páginas físicas y verifica citas literales con
JSON validado. La matriz distingue ausencia, contradicción, aplicabilidad y sustento
insuficiente. Una cita literal no garantiza interpretación correcta ni autenticidad.

El set de desarrollo contiene dos licitaciones históricas y adjudicaciones provisionales.
La primera extracción evaluada v2 obtiene cobertura estricta de 31/34 etiquetas y
citas suficientes en 19/25 candidatos auditados; la segunda, 11/12 y 12/16. Son muestras
seleccionadas, con denominadores diferentes; no estiman calidad global ni ahorro de tiempo.
Los PDFs históricos y snapshots privados no se incluyen en el clon; la demo ficticia sí.
[Evaluación y reproducción](eval/README.md).

Notas: [ingesta](docs/INGESTION_NOTES.md), [extracción](docs/EXTRACTION_NOTES.md),
[matriz](docs/MATRIX_NOTES.md), [gestión de originales](docs/VAULT_EXPORT.md)
y [API de Meta](docs/META_API_NOTES.md).

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
packages/core   núcleo del agente, herramientas, checkpoints, esquemas y paquete
packages/web    interfaz local servida en localhost
fixtures/       demo ficticia pública y bases históricas privadas
eval/           set de evaluación
docs/           notas técnicas
```

## Herramientas de desarrollo

Parte del código de este repositorio se escribió con la ayuda de [Claude Code](https://claude.com/claude-code).

## Licencia

[MIT](LICENSE)
