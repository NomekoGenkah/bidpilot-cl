# Notas sobre la Meta Model API

Documento de trabajo. Se completa a medida que verificamos cada punto con llamadas reales.

## Preguntas abiertas

### Autenticación y endpoints

- [ ] ¿Cómo se autentica (header, formato de la clave)?
- [ ] URL base y endpoints disponibles (chat/completions, otros).
- [ ] ¿Es compatible con algún SDK existente (formato tipo OpenAI u otro)?
- [ ] Nombres exactos de los modelos disponibles.

### Tool use y salida estructurada

- [ ] ¿Soporta tool use / function calling? ¿Con qué formato?
- [ ] ¿Soporta salida estructurada con JSON Schema? ¿Qué tan fiable es?
- [ ] ¿Permite varias llamadas a herramientas en una sola respuesta?

### Límites de tasa

- [ ] Solicitudes y tokens por minuto.
- [ ] Comportamiento al exceder el límite (código de error, `Retry-After`).

### Ventana de contexto

- [ ] Tamaño de la ventana de contexto y máximo de tokens de salida.
- [ ] Latencia típica con bases de ~40 páginas.

### PDF e imágenes

- [ ] ¿Acepta PDF directamente?
- [ ] ¿Acepta imágenes (útil para bases escaneadas)? Formatos y tamaño máximo.

## Hallazgos

_(vacío)_
