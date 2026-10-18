import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import config from './config.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import healthRoutes from './routes/health.js';
import keyRoutes from './routes/keys.js';
import modelRoutes from './routes/models.js';
import settingsRoutes from './routes/settings.js';
import skillRoutes from './routes/skills.js';
import statusRoutes from './routes/status.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // --- Logs ---------------------------------------------------------------
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // --- CORS (sección 7: restringido al dominio del frontend) --------------
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
      credentials: true,
    }),
  );

  // --- Parsers ------------------------------------------------------------
  // Las imágenes van en base64 dentro del JSON: subimos el límite.
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // --- Cabeceras de seguridad --------------------------------------------
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // --- API ----------------------------------------------------------------
  app.use('/api', apiLimiter);
  app.use('/api/health', healthRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/keys', keyRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/models', modelRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/chat', chatRoutes);

  // --- Frontend estático (Next.js `output: export`) -----------------------
  const dist = config.frontendDist;
  if (fs.existsSync(dist)) {
    app.use(
      express.static(dist, {
        index: ['index.html'],
        extensions: ['html'],
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
          if (/\/(_next|assets)\//.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Fallback para rutas del cliente (solo GET/HEAD, nunca /api).
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (path.extname(req.path)) return next();
      const candidate = path.join(dist, req.path, 'index.html');
      if (fs.existsSync(candidate)) return res.sendFile(candidate);
      const fallback = path.join(dist, 'index.html');
      if (fs.existsSync(fallback)) return res.sendFile(fallback);
      next();
    });
  } else {
    app.get('/', (req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send(
          'OpenCode Web Chat API en marcha.\n' +
            `El frontend compilado no se encontró en ${dist}.\n` +
            'Ejecuta `npm run build` en la raíz del proyecto.\n',
        );
    });
  }

  // --- Errores ------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
