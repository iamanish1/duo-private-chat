import { badRequest } from '../utils/AppError.js';

export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const first = result.error.issues[0];
  throw badRequest(
    first?.message && !first.message.startsWith('Invalid input') ? first.message : 'Some of the details sent are invalid.',
    'VALIDATION_ERROR',
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

/** Validates request parts; parsed values land on `req.valid` (req.query is read-only in Express 5). */
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const [source, schema] of Object.entries(schemas)) {
    req.valid[source] = parseOrThrow(schema, req[source]);
  }
  next();
};
