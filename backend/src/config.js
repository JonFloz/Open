import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Raíz del monorepo (…/opencode-web-chat). */
export const rootDir = path.resolve(__dirname, '..', '..');

const env = process.env.NODE_ENV ?? 'development';
const isProd = env === 'production';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function list(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const dataDir = process.env.DATA_DIR ?? (isProd ? '/data' : path.join(os.tmpdir(), 'opencode-web-chat'));

const jwtSecret = process.env.JWT_SECRET ?? '';
const encryptionKey = process.env.ENCRYPTION_KEY ?? '';

if (isProd && (!jwtSecret || !encryptionKey)) {
  throw new Error(
    'JWT_SECRET y ENCRYPTION_KEY son obligatorios en producción. Defínelos en las variables de entorno de Render.',
  );
}

if (!jwtSecret || !encryptionKey) {
  // Solo en desarrollo: secretos efímeros para no romper el arranque local.
  console.warn(
    '[config] JWT_SECRET/ENCRYPTION_KEY no definidos: usando secretos efímeros de desarrollo. ' +
      'Los tokens y las API keys guardadas dejarán de ser válidos al reiniciar.',
  );
}

const devFallback = crypto.createHash('sha256').update('opencode-web-chat-dev').digest('hex');

export const config = {
  env,
  isProd,
  rootDir,
  port: Number(process.env.PORT ?? 3001),

  // --- Persistencia -------------------------------------------------------
  dataDir,
  databasePath: process.env.DATABASE_PATH ?? path.join(dataDir, 'opencode.db'),
  skillsDir: process.env.SKILLS_DIR ?? path.join(dataDir, 'skills'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(dataDir, 'uploads'),

  // --- Seguridad ----------------------------------------------------------
  jwtSecret: jwtSecret || devFallback,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  encryptionKey: encryptionKey || `${devFallback}-encryption`,
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  corsOrigins: list(process.env.CORS_ORIGINS),

  // --- Archivos -----------------------------------------------------------
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
  allowedImageMime: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],

  // --- Frontend -----------------------------------------------------------
  frontendDist: process.env.FRONTEND_DIST ?? path.join(rootDir, 'frontend', 'out'),

  // --- Servidor de OpenCode ----------------------------------------------
  opencode: {
    baseUrl: process.env.OPENCODE_BASE_URL ?? '',
    password: process.env.OPENCODE_SERVER_PASSWORD ?? '',
    autostart: bool(process.env.OPENCODE_AUTOSTART, true),
    port: Number(process.env.OPENCODE_PORT ?? 4096),
    hostname: process.env.OPENCODE_HOSTNAME ?? '127.0.0.1',
    bin: process.env.OPENCODE_BIN ?? 'opencode',
    directory: path.resolve(process.env.OPENCODE_DIRECTORY ?? path.join(dataDir, 'workspace')),
    defaultModel: process.env.OPENCODE_DEFAULT_MODEL ?? 'opencode-go/deepseek-v4.1-flash',
    defaultAgent: process.env.OPENCODE_DEFAULT_AGENT ?? 'build',
    /** Integración usada al registrar la API key personal de un usuario. */
    credentialIntegration: process.env.OPENCODE_CREDENTIAL_INTEGRATION ?? 'opencode-go',
    /** Tiempo máximo (ms) para esperar a que el servidor esté listo. */
    startupTimeout: Number(process.env.OPENCODE_STARTUP_TIMEOUT ?? 30000),
  },

  // --- Cachés -------------------------------------------------------------
  modelsCacheTtl: Number(process.env.MODELS_CACHE_TTL ?? 60 * 60 * 1000), // 1 hora
};

/** Crea los directorios de datos necesarios. */
export function ensureDataDirs() {
  for (const dir of [config.dataDir, config.skillsDir, config.uploadsDir, config.opencode.directory]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
}

export default config;
