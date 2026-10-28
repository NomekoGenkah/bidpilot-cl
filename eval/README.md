# Set de evaluación

Primera muestra de desarrollo: **34 requisitos clave, 8 exclusiones y 3 ambigüedades**
de las bases históricas `730566-48-L123`. Las etiquetas se definieron leyendo el texto
de las páginas, con sus citas de referencia; las correspondencias con la extracción
se registraron explícitamente. Son provisionales y están pendientes de revisión del
usuario. Este documento ya se utilizó para ajustar el prompt: **no es un test ciego**.

- [Etiquetas de referencia](labels/730566-48-L123.json): contenido esperado, categoría, etapa, naturaleza y una o varias citas por requisito.
- [Revisión de la extracción congelada](reviews/730566-48-L123.baseline.json): recuperaciones completas, parciales y ausentes; auditoría de 25 candidatos; exclusiones.
- [Resultados y próximos ajustes](BASELINE.md).

## Reproducir

Con los archivos de la ingesta y extracción disponibles localmente:

```bash
npm run eval -- 730566-48-L123
```

No llama al modelo ni requiere `.env`. Genera `data/eval/730566-48-L123.json`.
El comando verifica las citas de referencia, la coincidencia del hash declarado del PDF,
el hash del texto por páginas, el hash de la extracción y el hash de las etiquetas.
No vuelve a leer ni extraer el PDF. Rechaza adjudicaciones
desactualizadas, IDs duplicados, referencias inexistentes o etiquetas sin adjudicar.
El hash de las etiquetas se calcula sobre `JSON.stringify` del JSON leído; el hash de
la extracción corresponde al contenido UTF-8 exacto del archivo.

Se conservó una copia local de la extracción evaluada para poder volver a ella después
de ejecutar nuevamente el modelo:

```bash
npm run eval -- 730566-48-L123 fixtures/private/730566-48-L123/requirements.baseline.json
```

Los PDFs, textos completos y extracciones congeladas permanecen fuera de Git. Desde
un clon sin esos archivos es necesario obtener las [bases originales](../docs/INGESTION_NOTES.md),
ingestarlas y generar una extracción nueva; esa extracción necesita su propia revisión,
porque puede diferir de la evaluada aquí.

## Criterios de etiquetado

Una etiqueta agrupa una exigencia verificable y conserva sus cantidades, plazos,
condiciones y alternativas permitidas. Puede necesitar varias citas cuando la condición
o el encabezado se encuentra en otra página. Los criterios que solo otorgan puntaje se
etiquetan como `criterio_evaluacion`, no como obligaciones universales.

Las facultades opcionales, obligaciones del organismo, reglas internas y antecedentes
se representan como exclusiones. Las versiones distintas de una cláusula se conservan
y se señalan como ambigüedades; no se elige cuál prevalece.

Para la correspondencia semántica se usa `completo`, `parcial` o `ausente`. Un candidato
puede recuperar varias etiquetas relacionadas. No se infieren equivalencias por palabras
clave: el evaluador valida y cuenta las adjudicaciones registradas. Una extracción nueva
requiere revisar esas correspondencias y auditorías; no basta con cambiar los hashes.

En la auditoría de candidatos, `correcto` exige conservar el significado y las condiciones
relevantes; `parcial` identifica omisiones de condiciones, alcance o alternativas;
`incorrecto` contradice o inventa contenido; `fuera_alcance` no es una exigencia del
proveedor ni un criterio de puntaje. La suficiencia de la cita se juzga aparte: una cita
puede existir literalmente y aun así no respaldar toda la descripción.

Las métricas tienen denominadores distintos: cobertura sobre las 34 etiquetas elegidas,
precisión y suficiencia sobre 25 candidatos auditados, coincidencia literal sobre los
66 candidatos. No son estimaciones de calidad para todas las licitaciones ni un inventario
exhaustivo del documento. No se calcula F1 combinando estas muestras diferentes.
