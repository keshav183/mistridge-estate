export class HttpError extends Error {
  constructor(status, message, code = 'error', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (m, code = 'bad_request', d) => new HttpError(400, m, code, d);
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const conflict = (m, code = 'conflict') => new HttpError(409, m, code);
