import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './config.js';

/**
 * MongoDB is optional.
 *  - MONGODB_URI set  -> use that database (local mongod, Docker, Atlas).
 *  - MONGODB_URI empty -> start an embedded MongoDB (mongodb-memory-server) that stores its files in ./.data,
 *    so data survives restarts. First run downloads the MongoDB binary once (~70 MB) and caches it.
 */
export async function connectDb() {
  mongoose.set('strictQuery', true);
  if (config.mongoUri) {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
    return { mode: 'external', close: () => mongoose.disconnect() };
  }
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  } catch {
    throw new Error('MONGODB_URI is not set and the embedded database is not installed. Run "npm install" in backend/, or set MONGODB_URI.');
  }
  const dbPath = path.resolve(config.dataDir, 'db');
  fs.mkdirSync(dbPath, { recursive: true });
  console.log('MONGODB_URI not set: starting embedded MongoDB (first run downloads the binary once)...');
  const server = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } });
  await mongoose.connect(server.getUri('mistridge'));
  const close = async () => { await mongoose.disconnect(); await server.stop({ doCleanup: false }); };
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => close().finally(() => process.exit(0)));
  return { mode: 'embedded', close };
}
