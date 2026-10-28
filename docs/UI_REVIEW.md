# Interfaz de revisión · 28 de octubre de 2026

La pantalla abre la licitación seleccionada con sus acciones y tres secciones:
Matriz, Preguntas y Documentos. Se retiraron el bloque promocional inicial y los
subtítulos explicativos repetidos. Las ayudas secundarias están en botones «?» con
hover, foco de teclado y toque; Escape o un clic fuera las cierran. El aviso de
revisión humana permanece visible al pie y el perfil ficticio queda identificado.

## Revisión

La matriz es una tabla con búsqueda por texto/ID, filtro de estado, etapa y páginas
de 15 filas. «Por resolver» excluye los casos cumplidos y los no aplicables, excepto
si sus bases necesitan revisión. Se priorizan citas pendientes y contradicciones.
El texto completo se conserva en el detalle; las etiquetas cortas y el recorte de
texto de la lista no cambian los requisitos ni el resultado exportado.

«Revisar bases» identifica un problema en el sustento del requisito, mientras que
«Falta evidencia» identifica un faltante documental. «No aplica» tiene etiqueta y
filtro propios, conservando el estado original en la API y exportaciones. Los
contadores son filtros; «Revisar bases» es un subconjunto de «Por resolver».

Al elegir una fila se abre un panel con requisito completo, condiciones,
alternativas, razón, citas y respuesta. En escritorio ancho las citas de bases y
proveedor se muestran en columnas. En móvil el detalle ocupa el lugar de la lista;
«Volver a la lista» devuelve el foco a la fila elegida. Los borradores de respuestas
se conservan durante la sesión de la página y se guardan en disco al enviar; no
persisten si se recarga sin guardar.

La sección Preguntas usa el mismo detalle y muestra las respuestas existentes. El
botón «Guardar y actualizar» conserva el comportamiento anterior: guarda la
declaración y vuelve a analizar toda la matriz mediante Meta. Sus límites no cambian.

## Documentos

«Añadir documento» despliega la carga de PDF/texto. Tras guardar se cierra el
formulario. Cada documento tiene una acción Abrir para leer sus páginas; la búsqueda
local enlaza cada fragmento con su página. Se conserva el perfil ficticio de prueba.
No se añadieron eliminación de documentos, OCR ni cambios al motor de contraste.

## Comprobaciones

Se recorrieron ambas licitaciones reales ya analizadas, sin regenerar sus resultados
con Meta para este cambio de presentación:

- Búsqueda por ID, filtros de estados y etapa, paginación y cambio de licitación.
- Panel de citas, pregunta con respuesta guardada y retorno de foco a la fila.
- Guardado de la misma respuesta ficticia existente mediante el endpoint real;
  generación y sondeo simulados solo en esa sesión del navegador para comprobar
  el recorrido del botón sin repetir llamadas al modelo.
- Carga real de un PDF ficticio y lectura por página en un baúl separado de prueba.
- Búsqueda de documentos y apertura de su contenido.
- Ayudas con hover, foco y toque/clic; Escape y límites del tooltip en móvil.
- Escritorio de 1440 px y móvil de 390 px sin desbordamiento horizontal.
- Axe sin infracciones en las vistas probadas; no sustituye una evaluación manual
  completa de accesibilidad.

En la muestra Adobe, la primera fila pasó de unos 756 a 420 píxeles desde el inicio
en escritorio, y de unos 2166 a 547 en móvil. La vista inicial de escritorio pasó de
unos 38.000 píxeles a unos 1656 mediante paginación. Los 63 requisitos permanecen
accesibles. Ya no se muestran los 53 formularios simultáneamente.

`npm run check` mantiene los 39 tests del motor y la integración HTTP. Este rediseño
no cambia la API, la persistencia, los controles de citas ni las evaluaciones previas.
