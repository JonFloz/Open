import config, { ensureDataDirs } from './config.js';
import { createApp } from './app.js';
import { closeDb } from './db/sqlite.js';
import { eventHub } from './services/eventHub.js';
import { ensureServer, stopServer } from './services/opencodeServer.js';

const RETRY_DELAY = 15_000;

async function bootstrapOpenCode() {
  for (;;) {
    try {
      const { baseUrl } = await ensureServer();
      console.log(`[opencode] servidor disponible en ${baseUrl}`);
      eventHub.start();
      return;
    } catch (error) {
      console.error(`[opencode] no disponible todavía: ${error.message}`);
      console.error(`[opencode] reintento en ${RETRY_DELAY / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

async function main() {
  ensureDataDirs();

  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] OpenCode Web Chat escuchando en http://0.0.0.0:${config.port} (${config.env})`);
    console.log(`[api] datos en ${config.dataDir}`);
    console.log(
      `[api] secretos: origen=${config.secretsSource}` +
        (config.secretsPersisted ? ' (persistidos en el disco)' : '') +
        (config.secretsSource !== 'env' ? ' — define JWT_SECRET y ENCRYPTION_KEY en Render' : ''),
    );
    if (!config.opencode.baseUrl) {
      console.log(`[api] OpenCode se arrancará como proceso hijo en el puerto ${config.opencode.port}`);
    }
  });

  // El servidor de OpenCode arranca en segundo plano: la API y el health check
  // están disponibles de inmediato aunque OpenCode tarde en levantar.
  void bootstrapOpenCode();

  const shutdown = async (signal) => {
    console.log(`[api] recibido ${signal}, cerrando…`);
    server.close();
    await eventHub.stop();
    await stopServer();
    try {
      closeDb();
    } catch {
      /* noop */
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => console.error('[api] promesa rechazada sin manejar:', reason));
}

main().catch((error) => {
  console.error('[api] error fatal durante el arranque:', error);
  process.exit(1);
});
