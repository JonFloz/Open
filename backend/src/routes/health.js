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
    storage: {
      dataDir: config.dataDir,
      writable: config.dataDirWritable,
      warning: config.dataDirWarning
        ? `${config.dataDirWarning} Los datos no serán persistentes: añade un disco montado en /data.`
        : null,
    },
    security: {
      secretsSource: config.secretsSource,
      secretsPersisted: config.secretsPersisted,
      warning:
        config.secretsSource === 'env'
          ? null
          : config.secretsPersisted
            ? 'JWT_SECRET/ENCRYPTION_KEY no están en variables de entorno; se usan los guardados en el disco.'
            : 'JWT_SECRET/ENCRYPTION_KEY son efímeros: define las variables en Render para no perder las sesiones.',
    },
    opencode: serverStatus(),
    events: eventHub.status,
  });
});

export default router;
