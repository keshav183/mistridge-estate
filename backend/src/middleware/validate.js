import { HttpError } from '../lib/errors.js';

/** validate(schema, 'body'|'query'|'params') — replaces the input with the parsed (stripped, coerced) value. */
export const validate = (schema, where = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[where]);
  if (!result.success) {
    const fields = {};
    for (const i of result.error.issues) fields[i.path.join('.') || '_'] = i.message;
    return next(new HttpError(400, 'Please check the highlighted fields.', 'validation', fields));
  }
  if (where === 'query') Object.defineProperty(req, 'query', { value: result.data, writable: true });
  else req[where] = result.data;
  next();
};
