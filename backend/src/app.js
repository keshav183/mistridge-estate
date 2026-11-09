import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { loadUser } from './middleware/auth.js';
import { requireRole } from './middleware/auth.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import enquiryRoutes from './routes/enquiries.js';
import publicRoutes from './routes/public.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'upgrade-insecure-requests': config.env === 'production' ? [] : null, 'img-src': ["'self'", 'data:'], 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"] },
    },
  }));
  app.use(compression());
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  if (config.clientOrigin && config.env !== 'production') {
    app.use((req, res, next) => {
      res.set({ 'Access-Control-Allow-Origin': config.clientOrigin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, x-ingest-key', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', Vary: 'Origin' });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', loadUser);
  app.use('/api/auth', authRoutes);
  app.use('/api/enquiries', enquiryRoutes);
  app.use('/api/admin', requireRole('reservations', 'sales', 'gm'), adminRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', notFoundHandler);

  app.use('/uploads', express.static(path.resolve(config.uploadDir), { maxAge: '30d', immutable: true, fallthrough: false }));

  // Single-origin production: serve the built React app.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true }));
    app.use('/photos', express.static(path.join(dist, 'photos'), { maxAge: '7d' }));
    app.use(express.static(dist, { maxAge: '5m', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
