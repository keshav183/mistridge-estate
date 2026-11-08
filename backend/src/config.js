import 'dotenv/config';
import crypto from 'node:crypto';

const env = (key, fallback = '') => process.env[key] ?? fallback;
const isProd = env('NODE_ENV', 'development') === 'production';

export const config = {
  env: env('NODE_ENV', 'development'),
  port: Number(env('PORT', 4000)),
  // Empty = run on an embedded MongoDB (no install needed). Set it to use a real MongoDB / Atlas.
  mongoUri: env('MONGODB_URI'),
  dataDir: env('DATA_DIR', '.data'),
  // In development a missing secret becomes a random one (sessions reset on restart). Production must set it.
  jwtSecret: env('JWT_SECRET') || (isProd ? '' : crypto.randomBytes(32).toString('hex')),
  clientOrigin: env('CLIENT_ORIGIN'),
  geminiKey: env('GEMINI_API_KEY'),
  geminiModel: env('GEMINI_MODEL', 'gemini-2.5-flash'),
  ingestKey: env('INGEST_KEY'),
  confidenceThreshold: Number(env('AI_CONFIDENCE_THRESHOLD', 0.6)),
  seedPassword: env('SEED_PASSWORD', 'Demo@1234'),
  brand: 'Mistridge Estate',
};

export function assertConfig() {
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
}
