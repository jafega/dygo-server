// Errores de mainds business.
//
// Formato de respuesta único (R12): { error: '<texto en español>', code: '<CONSTANTE>' }.
// Los handlers lanzan `httpError(...)` (o dejan escapar un StoreError) y
// `sendError` lo traduce a HTTP. Nunca se devuelve ni se loguea el detalle de
// un error desconocido: puede llevar datos clínicos o de pacientes (R10).

export class BusinessError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
    this.code = code;
    if (extra) this.extra = extra;
  }
}

export const httpError = (status, code, message, extra) => new BusinessError(status, code, message, extra);

export const notFound = (message = 'No encontrado') => httpError(404, 'NOT_FOUND', message);
export const forbidden = (message = 'No tienes permiso para realizar esta acción') => httpError(403, 'FORBIDDEN', message);
export const badRequest = (message, code = 'BAD_REQUEST') => httpError(400, code, message);

// Códigos de StoreError (backend/business/store.js) → HTTP.
const STORE_CODE_TO_HTTP = {
  BUSINESS_NOT_MIGRATED: [503, 'mainds business todavía no está disponible: faltan las tablas en la base de datos.'],
  UNIQUE_VIOLATION: [409, 'Ya existe un registro con esos datos.'],
  LIMIT_TOO_LARGE: [400, 'La consulta pide demasiados registros. Acota el rango.'],
  NOT_FOUND: [404, 'No encontrado']
};

/** Traduce cualquier error a { status, body } sin filtrar detalles internos. */
export function toHttp(err) {
  if (err instanceof BusinessError) {
    return { status: err.status, body: { error: err.message, code: err.code, ...(err.extra || {}) } };
  }
  if (err && err.name === 'FieldCryptoError' && err.code === 'ENCRYPTION_NOT_CONFIGURED') {
    return { status: 503, body: { error: 'El cifrado de datos clínicos no está configurado.', code: err.code } };
  }
  if (err && err.name === 'StoreError' && STORE_CODE_TO_HTTP[err.code]) {
    const [status, message] = STORE_CODE_TO_HTTP[err.code];
    return { status, body: { error: message, code: err.code } };
  }
  return { status: 500, body: { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' } };
}

/** Responde con el error en formato R12. Solo loguea metadatos, nunca contenido. */
export function sendError(res, err, logger = console) {
  const { status, body } = toHttp(err);
  if (status >= 500 && status !== 503) {
    try {
      logger.error('[business] error', JSON.stringify({ name: err?.name, code: err?.code || null }));
    } catch { /* el log nunca rompe la respuesta */ }
  }
  if (!res.headersSent) res.status(status).json(body);
}

/** Envuelve un handler async para que cualquier error acabe en sendError. */
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch((err) => sendError(res, err));
