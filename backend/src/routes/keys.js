import { Router } from 'express';
import { z } from 'zod';
import {
  countApiKeys,
  createApiKey,
  deleteApiKey,
  findApiKeyRow,
  listApiKeys,
  revealApiKey,
  setDefaultApiKey,
} from '../db/apiKeys.js';
import { getSettings, publicSettings, updateSettings } from '../db/settings.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authJWT } from '../middleware/authJWT.js';
import { validate } from '../middleware/validate.js';
import { ensureUserCredential, forgetUserCredential } from '../services/credentials.js';
import { generateText, mapOpenCodeError } from '../services/opencodeClient.js';
import { invalidateModelsCache } from './models.js';

const router = Router();
router.use(authJWT);

const createSchema = z.object({
  label: z.string().trim().max(80).optional(),
  provider: z.string().trim().max(80).optional(),
  key: z.string().trim().min(8, 'La API key parece demasiado corta').max(500),
});

/** Integraciones de OpenCode donde se puede registrar una key. */
const KNOWN_INTEGRATIONS = new Set([
  'opencode',
  'opencode-go',
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'openrouter',
  'xai',
  'mistral',
  'groq',
]);

/**
 * Registra y activa la credencial en el servidor de OpenCode.
 *
 * Es importante hacerlo al GUARDAR la key (no solo al chatear): mientras la
 * integración no tenga credencial, OpenCode no publica sus modelos, así que el
 * usuario seguiría viendo únicamente los gratuitos.
 */
async function registerCredential(req, row) {
  const integrationID = KNOWN_INTEGRATIONS.has(row.provider) ? row.provider : undefined;
  forgetUserCredential(req.user.id);
  const result = await ensureUserCredential({
    userId: req.user.id,
    apiKey: revealApiKey(row),
    integrationID,
  });
  // La lista de modelos cambia al activar una credencial: invalidamos la caché.
  invalidateModelsCache();
  return { ...result, integrationID: result.integrationID ?? integrationID ?? null };
}

/** GET /api/keys */
router.get('/', (req, res) => {
  res.json({ keys: listApiKeys(req.user.id), settings: publicSettings(getSettings(req.user.id)) });
});

/** POST /api/keys */
router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const key = createApiKey(req.user.id, req.body);
    if (key.isDefault) updateSettings(req.user.id, { defaultApiKeyId: key.id });

    const row = findApiKeyRow(req.user.id, key.id);
    const credential = await registerCredential(req, row);

    res.status(201).json({
      key,
      count: countApiKeys(req.user.id),
      credential: {
        applied: credential.applied,
        integrationID: credential.integrationID,
        warning: credential.applied
          ? null
          : `La key se guardó, pero OpenCode no la aceptó todavía (${credential.reason ?? credential.error}).`,
      },
    });
  }),
);

/** POST /api/keys/:id/default */
router.post(
  '/:id/default',
  asyncHandler(async (req, res) => {
    const key = setDefaultApiKey(req.user.id, req.params.id);
    if (!key) return res.status(404).json({ error: { code: 'not_found', message: 'API key no encontrada' } });
    updateSettings(req.user.id, { defaultApiKeyId: key.id });

    const row = findApiKeyRow(req.user.id, key.id);
    const credential = await registerCredential(req, row);
    res.json({ key, credential: { applied: credential.applied, integrationID: credential.integrationID } });
  }),
);

/** POST /api/keys/:id/verify — registra la key y comprueba que OpenCode la acepta. */
router.post(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const row = findApiKeyRow(req.user.id, req.params.id);
    if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'API key no encontrada' } });

    const apiKey = revealApiKey(row);
    forgetUserCredential(req.user.id);

    const result = await ensureUserCredential({ userId: req.user.id, apiKey });
    invalidateModelsCache();
    if (!result.applied) {
      return res.status(502).json({
        error: {
          code: 'credential_failed',
          message: 'No se pudo registrar la API key en OpenCode',
          details: result,
        },
      });
    }

    // Comprobación con una generación mínima. OpenCode responde 401/403 cuando
    // rechaza la credencial activa; si responde, la credencial sirve.
    try {
      await generateText({ prompt: 'Responde únicamente con: ok' });
      return res.json({
        ok: true,
        verified: true,
        message: 'API key registrada; OpenCode respondió correctamente.',
        credential: { id: result.id, integrationID: result.integrationID },
      });
    } catch (error) {
      const mapped = mapOpenCodeError(error);
      if (mapped.status === 401 || mapped.status === 403) {
        return res.status(mapped.status).json({
          error: {
            code: 'invalid_api_key',
            message: `OpenCode rechazó la API key: ${mapped.message}`,
          },
        });
      }
      // La credencial se registró; no pudimos comprobarla en este momento.
      return res.json({
        ok: true,
        verified: false,
        warning: `La key quedó registrada, pero no se pudo comprobar ahora: ${mapped.message}`,
        credential: { id: result.id, integrationID: result.integrationID },
      });
    }
  }),
);

/** DELETE /api/keys/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = deleteApiKey(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: { code: 'not_found', message: 'API key no encontrada' } });
    forgetUserCredential(req.user.id);
    invalidateModelsCache();
    const settings = getSettings(req.user.id);
    if (settings.default_api_key_id === req.params.id) {
      const [first] = listApiKeys(req.user.id);
      updateSettings(req.user.id, { defaultApiKeyId: first?.id ?? null });
    }
    res.json({ ok: true });
  }),
);

export default router;
