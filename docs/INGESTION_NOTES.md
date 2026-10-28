# Primera ingesta real

Verificada el 27 de octubre de 2026.

## Consulta de Mercado Público

La consulta autenticada de licitaciones devolvió HTTP 200 y 1.315 registros.
Se consultó el detalle de `4301-70-LR26`, implementación y arriendo de software
de gestión municipal de Zapallar. La respuesta no incluyó adjuntos ni enlaces
a las bases. Al abrir los adjuntos en el portal, se mostró «Acceso denegado».
Esto describe la prueba realizada, no una limitación universal de todos los accesos.

## Documento usado para probar la extracción

Se utilizó una licitación histórica, `730566-48-L123`, «RENOVACION LICENCIAS JIRA +
POWER BI CONNECTOR FOR JIRA». Su detalle se obtuvo con HTTP 200 desde la API.
Las bases se descargaron desde el [sitio oficial del Ministerio de Desarrollo Social y Familia](https://www.desarrollosocialyfamilia.gob.cl/transparencia/documentos/2023/SES/Octubre/DAF/Adquisiciones/APRUEBA%20BASES%20Y%20DESIGNA%20COMISIN%20730566-48-L123.pdf).
El ID se encontró en el texto de la página física 2 del PDF.

Resultado con PDF.js en Node.js:

- PDF original: 113.051 bytes, guardado en `fixtures/private/730566-48-L123/bases.pdf`.
- 23 páginas físicas, 61.863 caracteres de texto y ninguna página vacía.
- Metadatos en `data/tenders/730566-48-L123/tender.json`.
- Texto por página, URL de origen, fecha de ingesta y SHA-256 en `data/tenders/730566-48-L123/bases.json`.

Los archivos descargados y resultados locales están excluidos de Git. Para reproducir,
descarga el PDF del enlace oficial a esa ruta y ejecuta desde la raíz del repositorio:

```bash
npm run ingest -- 730566-48-L123 fixtures/private/730566-48-L123/bases.pdf 'https://www.desarrollosocialyfamilia.gob.cl/transparencia/documentos/2023/SES/Octubre/DAF/Adquisiciones/APRUEBA%20BASES%20Y%20DESIGNA%20COMISIN%20730566-48-L123.pdf'
```

## Límites y siguiente paso

Se conserva el índice físico de cada página, incluidas las vacías; puede diferir de
la numeración impresa en el documento. El extractor rechaza archivos sin cabecera PDF
y documentos completamente sin texto. Informa páginas vacías para revisión; no realiza OCR.
La asociación entre el PDF y el ID es manual. Esta prueba no valida el orden de lectura
en todos los diseños de tablas, ni compara calidad contra un extractor Python.

La extracción de requisitos con Meta sobre estas páginas ya está implementada:
ver [EXTRACTION_NOTES.md](EXTRACTION_NOTES.md). Ya existe una muestra provisional etiquetada y métricas de desarrollo en
[eval/V2.md](../eval/V2.md).
