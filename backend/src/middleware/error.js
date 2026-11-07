import { HttpError } from '../lib/errors.js';

export const notFoundHandler = (_req, _res, next) => next(new HttpError(404, 'Not found', 'not_found'));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed request.' } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'duplicate', message: 'That already exists.' } });
  }
  console.error('[unhandled]', err?.message); // message only: never log request bodies (personal data)
  res.status(500).json({ error: { code: 'server', message: 'Something went wrong on our side. Please try again.' } });
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
