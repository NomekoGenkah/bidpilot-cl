# Demo reproducible sin Meta

Desde un clon nuevo con Node.js 24 LTS:

```bash
npm ci
npm run demo
```

Abre `http://127.0.0.1:3000` y pulsa **Probar demo sin Meta**. No necesitas `.env`,
API keys, PDFs privados ni acceso a las APIs. Las dependencias deben estar instaladas;
el navegador y el servidor se comunican únicamente por localhost.

El comando guarda sus datos en `data/demo/`, separados de los del uso normal.
Puedes elegir otra carpeta vacía con `BIDPILOT_DATA_DIR` y otro puerto con `PORT`.

## Guion de ensayo

1. Pulsa **Probar demo sin Meta** y observa lectura, extracción, búsqueda y contraste.
2. Revisa seis requisitos: tres tienen respaldo ficticio y tres requieren decisión.
3. Responde que el certificado, el plan y la revisión de multa siguen pendientes,
   o elige **Continuar con pendientes**.
4. Abre **Paquete**: la decisión queda pendiente; no se fabrican certificados ni fechas.
5. Revisa el borrador y sus citas. El plan de trabajo conserva el marcador por completar.
6. En **Exportar → Carpeta con documentos**, indica una carpeta existente y selecciona
   los originales que quieras copiar. Revisa el manifiesto y `postulacion.md`.
7. Recarga la página: el expediente conserva su estado y sus respuestas.

La licitación `990000-1-L126`, sus bases y los documentos son **totalmente ficticios**.
El PDF y su fuente legible están en `fixtures/public/demo/`. La reproducción utiliza
resultados estructurados definidos en código, valida las citas contra el PDF real de
la muestra y vuelve a construir matriz y paquete. **No llama a Meta ni mide su calidad.**
No acepta bases modificadas ni documentos propios como parte del escenario fijo.

El modo real se inicia con `npm start` y las claves de `.env.example`. La pantalla y
las exportaciones distinguen `live` de `replay`; el servidor iniciado con `npm run demo`
bloquea las rutas de análisis real. Cambiar respuestas en la demo no demuestra que el
modelo las interpretaría igual: solo ejercita el flujo y las reglas de conservación de
brechas.

El botón **Cargar perfil ficticio** de Documentos es anterior y diferente: añade un
perfil al baúl para contrastarlo con Meta en una licitación real. No es reproducción
offline. No uses datos ficticios al preparar una postulación real.

## Ensayo automatizado opcional

Con `agent-browser` y su Chromium instalados, ejecuta `npm run demo:rehearse`.
El script crea tres carpetas de datos vacías y servidores temporales, recorre la UI,
responde o difiere preguntas, exporta y verifica hashes, reinicia el servidor en la
pausa del tercer ensayo y comprueba escritorio/móvil, desbordamiento y accesibilidad.
No requiere claves y no hace llamadas a Meta. Guarda sus evidencias en una ruta de
`/tmp/bidpilot-rehearsal-*` que imprime al finalizar.

Las pruebas funcionales y sus límites se registran en [VERIFICATION.md](VERIFICATION.md).
