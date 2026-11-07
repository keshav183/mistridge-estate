import 'dotenv/config';

const env = (key, fallback = '') => process.env[key] ?? fallback;

export const config = {
  env: env('NODE_ENV', 'development'),
  port: Number(env('PORT', 4000)),
  mongoUri: env('MONGODB_URI', 'mongodb://127.0.0.1:27017/mistridge'),
  jwtSecret: env('JWT_SECRET'),
  clientOrigin: env('CLIENT_ORIGIN'),
  anthropicKey: env('ANTHROPIC_API_KEY'),
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
  ingestKey: env('INGEST_KEY'),
  confidenceThreshold: Number(env('AI_CONFIDENCE_THRESHOLD', 0.6)),
  seedPassword: env('SEED_PASSWORD', 'Demo@1234'),
  brand: 'Mistridge Estate',
};

export function assertConfig() {
  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters (see .env.example).');
  }
}
