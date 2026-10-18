import { Router } from 'express';
import config from '../config.js';
import { db } from '../db/sqlite.js';
import { eventHub } from '../services/eventHub.js';
import { serverStatus } from '../services/opencodeServer.js';

const router = Router();

const startedAt = Date.now();

function databaseHealthy() {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

/** GET /api/health — health check para Render. */
router.get('/', (req, res) => {
  const healthy = databaseHealthy();
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'opencode-web-chat',
    env: config.env,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    database: healthy,
    opencode: serverStatus(),
    events: eventHub.status,
  });
});

export default router;
