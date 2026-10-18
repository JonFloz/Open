import rateLimit from 'express-rate-limit';

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Demasiadas peticiones. Espera un momento antes de volver a intentarlo.',
      },
    });
  },
};

/** Límite para registro/login (evita fuerza bruta). */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
});

/** Límite para los endpoints de chat (costosos en tokens). */
export const chatLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 60,
});

/** Límite general para la API. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
});

export default { authLimiter, chatLimiter, apiLimiter };
