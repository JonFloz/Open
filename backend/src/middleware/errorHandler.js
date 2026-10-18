import config from '../config.js';

/** Error HTTP con código y estado, para respuestas uniformes. */
export class HttpError extends Error {
  constructor(status, message, code = 'error', extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'not_found', message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` },
  });
}

// eslint-disable-next-line no-unused-vars -- Express identifica el handler por su aridad
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    // Si ya empezamos a hacer streaming SSE solo cerramos la conexión.
    return res.end();
  }

  const status = Number(error.status ?? error.statusCode ?? 500);
  const code = error.code ?? (status >= 500 ? 'internal_error' : 'request_error');

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  const body = {
    error: {
      code,
      message: status >= 500 && config.isProd ? 'Error interno del servidor' : error.message,
    },
  };
  if (error.retryAfter) body.error.retryAfter = error.retryAfter;
  if (error.extra && Object.keys(error.extra).length > 0) body.error.details = error.extra;

  res.status(status).json(body);
}

/** Envuelve un handler async para que sus rechazos lleguen a errorHandler. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export default { HttpError, errorHandler, notFoundHandler, asyncHandler };
