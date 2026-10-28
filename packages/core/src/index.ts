export { ConfigError, loadConfig, type Config } from './config.js';
export { extractPdfPages, getTender } from './ingest.js';
export { extractRequirements, verifyCitations, requirementSchema } from './requirements.js';
export { addEvidence, readEvidence, searchEvidence, type Evidence } from './evidence.js';
export { buildMatrix, matrixMarkdown, type Matrix } from './matrix.js';
