import { Router } from 'express';
import config from '../config.js';
import { authJWT } from '../middleware/authJWT.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapOpenCodeError, listAgents, listCommands, listModels } from '../services/opencodeClient.js';

const router = Router();
router.use(authJWT);

/**
 * Caché en memoria de la lista de modelos (1 hora por defecto, sección 4.4).
 * La clave incluye el directorio porque los modelos pueden variar por proyecto.
 */
const cache = { key: null, at: 0, payload: null };

export function invalidateModelsCache() {
  cache.key = null;
  cache.at = 0;
  cache.payload = null;
}

/** GET /api/models */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const key = config.opencode.directory;
    const fresh = cache.key === key && Date.now() - cache.at < config.modelsCacheTtl;

    if (fresh) {
      return res.json({ ...cache.payload, cached: true });
    }

    try {
      const [models, agents, commands] = await Promise.all([
        listModels(),
        listAgents().catch(() => []),
        listCommands().catch(() => []),
      ]);

      const payload = {
        models,
        agents: agents.filter((agent) => !agent.hidden && agent.mode !== 'subagent'),
        commands,
        defaultModel: config.opencode.defaultModel,
        defaultAgent: config.opencode.defaultAgent,
        fetchedAt: new Date().toISOString(),
      };
      // Solo cacheamos respuestas con contenido: si el servidor acaba de
      // arrancar y aún no cargó los modelos, no queremos "envenenar" la caché.
      if (models.length > 0) {
        cache.key = key;
        cache.at = Date.now();
        cache.payload = payload;
      }
      res.json({ ...payload, cached: false });
    } catch (error) {
      throw mapOpenCodeError(error);
    }
  }),
);

/** GET /api/models/refresh — fuerza el refresco de la caché. */
router.get(
  '/refresh',
  asyncHandler(async (req, res) => {
    invalidateModelsCache();
    res.json({ ok: true });
  }),
);

export default router;
