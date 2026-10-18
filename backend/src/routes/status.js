import { Router } from 'express';
import config from '../config.js';
import { authJWT } from '../middleware/authJWT.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listAgents,
  listModels,
  listProviders,
  listOpenCodeSkills,
  mapOpenCodeError,
} from '../services/opencodeClient.js';
import { eventHub } from '../services/eventHub.js';
import { ping, serverLogs, serverStatus } from '../services/opencodeServer.js';

const router = Router();
router.use(authJWT);

/**
 * GET /api/status
 * Estado de la conexión con el servidor de OpenCode: es el endpoint detrás del
 * comando `/status` del chat.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const probe = await ping();
    res.status(probe.ok ? 200 : 503).json({
      connected: probe.ok,
      server: {
        ...serverStatus(),
        version: probe.ok ? probe.info?.version : serverStatus().version,
      },
      events: eventHub.status,
      directory: config.opencode.directory,
      defaultModel: config.opencode.defaultModel,
      defaultAgent: config.opencode.defaultAgent,
      error: probe.ok ? null : (probe.error ?? `HTTP ${probe.status}`),
    });
  }),
);

/** GET /api/status/logs — últimas líneas del servidor gestionado (diagnóstico). */
router.get('/logs', (req, res) => {
  res.json({ logs: serverLogs(50) });
});

/** GET /api/status/capabilities — modelos, agentes, proveedores y skills del servidor. */
router.get(
  '/capabilities',
  asyncHandler(async (req, res) => {
    try {
      const [models, agents, providers, skills] = await Promise.all([
        listModels(),
        listAgents().catch(() => []),
        listProviders().catch(() => []),
        listOpenCodeSkills().catch(() => []),
      ]);
      res.json({
        models: models.length,
        agents,
        providers: providers.map((provider) => ({ id: provider.id, name: provider.name })),
        skills: skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description })),
      });
    } catch (error) {
      throw mapOpenCodeError(error);
    }
  }),
);

export default router;
