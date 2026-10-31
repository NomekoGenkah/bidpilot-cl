import { fileURLToPath } from 'node:url';
process.env.BIDPILOT_REPLAY = '1';
process.env.BIDPILOT_DATA_DIR ??= fileURLToPath(new URL('../data/demo/', import.meta.url));
await import('../packages/web/src/server.js');
