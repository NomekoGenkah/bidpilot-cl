# BidPilot CL

Agente que prepara postulaciones a licitaciones de [Mercado Público](https://www.mercadopublico.cl) (Chile): lee las bases, extrae los requisitos con su cita, los contrasta con tu evidencia y te deja un paquete de postulación casi listo para revisar.

> Proyecto en construcción para el Meta Global AI Developer Hackathon (pista Indie).

## Local-first

BidPilot CL corre en tu computador. Tus documentos y datos se guardan localmente (carpeta `data/`); lo único que sale de tu máquina son las llamadas al modelo de Meta y las consultas a la API de Mercado Público.

## Instalación

Requiere Node.js 20 o superior.

```bash
npm install
cp .env.example .env   # completa tus claves
npm start              # abre http://127.0.0.1:3000
```

Otros comandos: `npm run dev` (recarga automática), `npm test`, `npm run lint`, `npm run typecheck` y `npm run check` (los tres anteriores).

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
