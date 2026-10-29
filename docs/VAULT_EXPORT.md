# Originales y exportación a carpeta

## Baúl

En Documentos, «Añadir documento» acepta archivos de hasta 8 MB o texto pegado. Se
conservan los bytes originales, su nombre y SHA-256, además del texto por página si
se puede extraer. PDF con texto y archivos UTF-8 se analizan; otros formatos, PDF sin
texto legible/protegidos o documentos cuyo texto supera 200.000 caracteres quedan
**Sin analizar**. No se hace OCR ni se interpretan DOCX, imágenes o planillas.

Guardar un archivo no acredita cumplimiento. Los documentos sin analizar se excluyen
de la búsqueda y no se aceptan como fuente de citas de cumplimiento. Pueden añadirse
explícitamente a una exportación como adjuntos para revisión manual.

«Abrir» muestra el texto extraído y las acciones sobre el original. PDF/texto permiten
abrir el original en otra pestaña o descargarlo. Otros formatos se descargan como
adjuntos, sin ejecutarlos ni interpretarlos en la aplicación.

Los documentos anteriores a esta función pueden tener solo texto extraído. La UI lo
indica y no fabrica un original a partir de ese texto. Puedes reemplazarlos cargando
el archivo original; la matriz necesitará una actualización.

«Reemplazar» conserva el identificador del documento y cambia el contenido y sus
metadatos al guardar. Si el reemplazo es inválido, el documento anterior permanece.
No hay historial de versiones: exporta una copia antes de reemplazar si necesitas
conservar el archivo anterior.

«Retirar» pide confirmación, saca el documento del baúl activo y conserva metadatos y
original en `data/evidence/.retirados/`. No es borrado definitivo y no hay interfaz de
restauración. Cambios, reemplazos y retiros invalidan las matrices que se calcularon
con la evidencia anterior; no borran sus resultados ni las evaluaciones.

## Exportación

1. Abre una licitación con análisis actualizado.
2. En Exportar, elige «Carpeta con documentos».
3. Pega la ruta absoluta de una carpeta existente en el computador donde corre
   BidPilot, por ejemplo `/home/usuario/Documentos`.
4. Revisa la selección. Se marcan por defecto los documentos citados que tienen
   original. Los demás quedan sin marcar; los antiguos sin original no se pueden
   incluir. Puedes omitir respaldos citados o añadir otros archivos explícitamente.
5. Pulsa «Guardar copia en carpeta». El resultado muestra la ruta creada.

Este hito usa una ruta escrita, no un selector nativo del sistema. En Docker, la ruta
es la del contenedor: usa una carpeta existente y escribible dentro de un volumen,
por ejemplo `/app/data/exportaciones`, para recuperar la copia desde el host.

Se crea un subdirectorio nuevo `BidPilot-<id>-<fecha Chile>-<sufijo>`, con:

- `matriz.json` y `matriz.md`: análisis completo, citas y marca de perfil ficticio.
- `preguntas.json`: preguntas del análisis y declaraciones guardadas.
- `referencias.json`: relación requisito/archivo/página, con `included` y ruta relativa
  o `null` cuando se omitió el original.
- `contenido.json`: archivos incluidos, hashes y documentos citados omitidos.
- `documentos/`: copias de los originales seleccionados, con identificador y nombre.
- `LEEME.txt`: alcance de la copia y límites de uso.

La matriz conserva citas y descripciones aunque excluyas un original; excluir un
archivo no anonimiza la matriz. Revisa la copia antes de compartirla. Es un paquete
de revisión, no una oferta presentada ni un conjunto de anexos listo para postular.
No se copian el resto del baúl, claves, configuración ni las bases PDF automáticamente.

La exportación comprueba los hashes de los originales y bloquea matrices obsoletas.
Escribe en una carpeta temporal privada y publica la copia al completarse. No
sobrescribe carpetas existentes. Se prohíbe usar el propio baúl como destino. Retirar
o reemplazar documentos después no modifica una copia ya exportada.

## Verificación

Se probaron por HTTP y en Chromium la descarga original, selección previa,
exportación real a una carpeta temporal, reemplazo y retiro. En una copia de prueba
con documentos ficticios y una matriz existente adaptada a sus identificadores, se
seleccionaron dos de tres originales citados: se exportaron solo dos, se registró el
omitido y ambos hashes coincidieron. Después del reemplazo y retiro, las copias
exportadas conservaron los mismos hashes y la matriz quedó desactualizada. No se
repitieron llamadas al modelo para esta prueba de gestión de archivos.

Los tests cubren compatibilidad con evidencia antigua, bytes PDF/texto, adjuntos sin
analizar, rechazo de respaldo no analizado, hashes alterados, destinos inválidos,
selección, referencias, independencia de las copias, conservación ante fallo de
reemplazo e invalidación de matrices. El modal se revisó en escritorio/móvil y con
axe. Los datos y exportaciones de prueba permanecen fuera de Git.
