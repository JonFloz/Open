import { z } from 'zod';

/**
 * Middleware de validación con zod.
 * @param {{body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType}} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    for (const key of ['body', 'query', 'params']) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return res.status(400).json({
          error: {
            code: 'validation_error',
            message: 'Datos inválidos',
            details: result.error.issues.map((issue) => ({
              path: issue.path.join('.') || key,
              message: issue.message,
            })),
          },
        });
      }
      // req.query es de solo lectura en Express 5: copiamos el resultado validado.
      if (key === 'query') {
        Object.defineProperty(req, 'validatedQuery', { value: result.data, configurable: true });
      } else {
        req[key] = result.data;
      }
    }
    next();
  };
}

export const emailSchema = z.string().trim().toLowerCase().email('Email inválido').max(254);

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(200, 'La contraseña es demasiado larga');

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const promptSchema = z.object({
  prompt: z.string().trim().min(1, 'El prompt no puede estar vacío').max(100_000),
  conversationId: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(200).optional().nullable(),
  agent: z.string().trim().max(80).optional().nullable(),
  skillIds: z.array(z.string().trim().max(80)).max(10).optional(),
  apiKeyId: z.string().trim().max(80).optional().nullable(),
  images: z
    .array(
      z.object({
        data: z.string().min(1),
        name: z.string().max(200).optional(),
        mimeType: z.string().max(100).optional(),
      }),
    )
    .max(5)
    .optional(),
});

export default { validate, emailSchema, passwordSchema, credentialsSchema, promptSchema };
