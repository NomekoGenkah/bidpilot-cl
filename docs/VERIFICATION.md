# Verificación del hito · 31 de octubre de 2026

El hito comprende entrada desde navegador, herramientas del agente, pausa y
continuación persistentes, paquete documental, exportación y demo reproducible.
No comprende validación con usuarios reales ni medición de ahorro de tiempo.

| Requisito                                             | Evidencia                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID, PDF y selección de evidencia desde navegador      | Recorrido real de `730566-25-L124` en Chromium, usando el PDF histórico de 23 páginas y un documento ficticio seleccionado entre tres disponibles. Sin comandos de ingesta/extracción.                                                                                                                        |
| Herramientas y recuperación                           | Llamadas nativas reales a Meta; reinicio durante extracción, recuperación de bloques 1–4 y 5–8; pausa para preguntas, respuesta y continuación. Checkpoints de matriz reutilizados por bloque. Tests de recuperación y validación de búsquedas en `agent.test.ts`, `requirements.test.ts` y `matrix.test.ts`. |
| Recomendación, riesgos, brechas, checklist y borrador | Paquete real generado con 63 filas. Cierre histórico `2024-05-20T17:00:00` produce `no_go`; los documentos ausentes siguen sin acreditarse. Los tests cubren fechas desconocidas, evidencia insuficiente y marcadores por completar.                                                                          |
| Exportación con trazabilidad                          | Copia real desde UI con un original seleccionado. Los ensayos de demo verifican los hashes de 13 artefactos y de todos los originales incluidos, además de omitir un original en el segundo ensayo. Pruebas HTTP bloquean exportación de paquetes incompletos u obsoletos.                                    |
| Demo desde datos vacíos                               | `npm run demo:rehearse`: tres servidores/carpetas vacías, respuestas completas, diferimiento completo y respuesta parcial con reinicio durante la pausa. Sin claves ni llamadas a Meta.                                                                                                                       |
| Verificaciones del repo                               | `npm run check`: tipos del núcleo, web y scripts, ESLint, Prettier y 53 tests. Ambas evaluaciones históricas siguen reproduciendo sus métricas.                                                                                                                                                               |
| Documentación                                         | README, `AGENT_WORKFLOW.md`, `DEMO.md` y notas históricas enlazadas.                                                                                                                                                                                                                                          |

El registro de la ejecución real y los hashes de sus archivos están en
[eval/agent-smoke/2026-10-31.json](../eval/agent-smoke/2026-10-31.json).
Es una prueba funcional, no una auditoría semántica completa ni una nueva estimación
de precisión. Las salidas completas y las exportaciones reales permanecen locales.

## Clon limpio verificado

Se clonó el repositorio local en una carpeta nueva sin `.env`, datos ni PDFs privados.
Con Node.js 24.21.0 se ejecutaron `npm ci`, `npm run check` y `npm run demo:rehearse`.
Sobre el código de `cee9b3f` pasaron los 53 tests y tres ensayos consecutivos completos.
[Registro de los ensayos](../eval/agent-smoke/demo-rehearsals-2026-10-31.json).

El ensayo en frío permitió corregir el orden de habilitación al terminar el análisis,
actualizar el nombre de la licitación al completar sus metadatos y desplazar el recorrido
a la cabecera antes de abrir Exportar. El hook HTTP admite 30 segundos para importar
las herramientas en frío y su limpieza tolera una preparación interrumpida; las
aserciones funcionales no se redujeron. También se comprobó que una licitación de
reproducción rechaza el endpoint de análisis real aunque el servidor se inicie en modo
normal.

## Reproducción

```bash
npm ci
npm run check
npm run demo
```

El ensayo automatizado requiere `agent-browser` y Chromium ya instalados:

```bash
npm run demo:rehearse
```

El script guarda snapshots, capturas, informes axe y resultados en una carpeta temporal.
Los tres ensayos comprueban persistencia al recargar, ausencia de errores de JavaScript,
escritorio y móvil de 390 px, ausencia de desbordamiento horizontal y cero infracciones
axe en las vistas del paquete. Eso no sustituye una evaluación manual completa de
accesibilidad ni valida todas las pantallas posibles.

La instalación limpia informó avisos moderados en dependencias de desarrollo.
`npm audit --omit=dev` no encontró vulnerabilidades de producción en la consulta
realizada. No se actualizaron dependencias en este hito.

## Alcance del borrador y pendientes

El borrador es una composición documental alineada por requisito y criterio de
evaluación. Conserva las citas y muestra lo que el proveedor debe completar; no redacta
compromisos comerciales nuevos ni inventa credenciales. Los plazos se conservan como
texto documental, sin calcular fechas relativas sin su evento inicial.

Siguen pendientes del plan global: pruebas con 2–3 usuarios y tiempos medidos, ampliar
y revisar el conjunto independiente de evaluación, video de 3 minutos, revisión del
historial de secretos y del acceso público sin sesión, confirmación de reglas y entrega.
No se han publicado cambios ni enviado postulaciones.
