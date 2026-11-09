import 'dotenv/config';
const PLACEHOLDER = 'hello123'; // demo value for every secret; replace for a real deployment

const env = (key, fallback = '') => process.env[key] ?? fallback;

export const config = {
  env: env('NODE_ENV', 'development'),
  port: Number(env('PORT', 4000)),
  // Empty = run on an embedded MongoDB (no install needed). Set it to use a real MongoDB / Atlas.
  mongoUri: env('MONGODB_URI'),
  dataDir: env('DATA_DIR', '.data'),
  jwtSecret: env('JWT_SECRET', PLACEHOLDER),
  clientOrigin: env('CLIENT_ORIGIN'),
  // The placeholder value means "no real key yet": the router then uses its built-in rules engine.
  geminiKey: env('GEMINI_API_KEY', PLACEHOLDER) === PLACEHOLDER ? '' : env('GEMINI_API_KEY'),
  geminiModel: env('GEMINI_MODEL', 'gemini-2.5-flash'),
  ingestKey: env('INGEST_KEY', PLACEHOLDER),
  confidenceThreshold: Number(env('AI_CONFIDENCE_THRESHOLD', 0.6)),
  seedPassword: env('SEED_PASSWORD', PLACEHOLDER),
  brand: 'Mistridge Estate',
};

export function assertConfig() {
  if (config.jwtSecret.length < 8) throw new Error('JWT_SECRET must be at least 8 characters.');
  if (config.env === 'production' && config.jwtSecret === PLACEHOLDER) console.warn('WARNING: JWT_SECRET is the demo value hello123. Change it before real use.');
}
