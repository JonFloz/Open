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

const configuredDataDir = process.env.DATA_DIR ?? (isProd ? '/data' : path.join(os.tmpdir(), 'opencode-web-chat'));

/**
 * Comprueba que el directorio de datos es escribible.
 *
 * Si el disco persistente de Render no está montado (por ejemplo, en el plan
 * gratuito o si se olvidó añadirlo), `/data` no existe o no es escribible. En
 * ese caso caemos a un directorio temporal en vez de dejar el servicio en un
 * bucle de reinicios, y lo avisamos bien claro.
 */
function resolveDataDir(candidate) {
  try {
    fs.mkdirSync(candidate, { recursive: true });
    fs.accessSync(candidate, fs.constants.W_OK);
    return { dataDir: candidate, writable: true, reason: null };
  } catch (error) {
    const fallback = path.join(os.tmpdir(), 'opencode-web-chat');
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch {
      /* si ni el temporal funciona, seguimos y que falle al abrir SQLite */
    }
    return {
      dataDir: fallback,
      writable: false,
      reason: `No se puede escribir en ${candidate} (${error.code ?? error.message}).`,
    };
  }
}

const dataDirResolution = resolveDataDir(configuredDataDir);
const dataDir = dataDirResolution.dataDir;

if (!dataDirResolution.writable) {
  console.error(
    `[config] ${dataDirResolution.reason} ` +
      `Se usará ${dataDir}, que NO es persistente: los datos se perderán en cada reinicio. ` +
      'Añade un disco persistente montado en /data en Render (plan Starter o superior).',
  );
}

const SECRETS_FILE = path.join(dataDir, 'secrets.json');

/**
 * Resuelve los secretos de firma de JWT y de cifrado de API keys.
 *
 * Prioridad:
 *  1. Variables de entorno `JWT_SECRET` y `ENCRYPTION_KEY` (lo recomendado).
 *  2. Fichero `secrets.json` dentro del disco persistente (se generó antes).
 *  3. Se generan aleatoriamente y se guardan en ese fichero.
 *
 * Así el servicio arranca en Render aunque se olvide definir las variables, y los
 * secretos sobreviven a reinicios y despliegues (el disco está montado en /data).
 */
function resolveSecrets() {
  const fromEnv = {
    jwt: (process.env.JWT_SECRET ?? '').trim(),
    encryption: (process.env.ENCRYPTION_KEY ?? '').trim(),
  };
  if (fromEnv.jwt && fromEnv.encryption) {
    return { jwt: fromEnv.jwt, encryption: fromEnv.encryption, source: 'env', persisted: false };
  }

  let stored = {};
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      stored = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
    }
  } catch (error) {
    console.warn(`[config] no se pudo leer ${SECRETS_FILE}: ${error.message}`);
  }

  const resolved = {
    jwt: fromEnv.jwt || stored.jwt || crypto.randomBytes(48).toString('base64url'),
    encryption: fromEnv.encryption || stored.encryption || crypto.randomBytes(48).toString('base64url'),
  };

  try {
    if (resolved.jwt !== stored.jwt || resolved.encryption !== stored.encryption) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(SECRETS_FILE, JSON.stringify(resolved, null, 2), { mode: 0o600 });
    }
    const missing = [!fromEnv.jwt && 'JWT_SECRET', !fromEnv.encryption && 'ENCRYPTION_KEY'].filter(Boolean);
    console.warn(
      `[config] ${missing.join(' y ')} sin definir: se generaron y guardaron en ${SECRETS_FILE}. ` +
        'Defínelas como variables de entorno en Render para controlarlas tú.',
    );
    return { ...resolved, source: 'file', persisted: true };
  } catch (error) {
    console.warn(
      `[config] no se pudo guardar ${SECRETS_FILE} (${error.message}): los secretos serán efímeros ` +
        'y las sesiones caducarán al reiniciar. Define JWT_SECRET y ENCRYPTION_KEY en Render.',
    );
    return { ...resolved, source: 'ephemeral', persisted: false };
  }
}

const secrets = resolveSecrets();
const jwtSecret = secrets.jwt;
const encryptionKey = secrets.encryption;

export const config = {
  env,
  isProd,
  rootDir,
  port: Number(process.env.PORT ?? 3001),

  // --- Persistencia -------------------------------------------------------
  dataDir,
  /** `true` si el directorio de datos es el esperado y es escribible. */
  dataDirWritable: dataDirResolution.writable,
  dataDirWarning: dataDirResolution.reason,
  databasePath: process.env.DATABASE_PATH ?? path.join(dataDir, 'opencode.db'),
  skillsDir: process.env.SKILLS_DIR ?? path.join(dataDir, 'skills'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(dataDir, 'uploads'),

  // --- Seguridad ----------------------------------------------------------
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  encryptionKey,
  /** De dónde salieron los secretos: `env`, `file` o `ephemeral`. */
  secretsSource: secrets.source,
  secretsPersisted: secrets.persisted,
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

/** Crea los directorios de datos necesarios. Nunca lanza: solo avisa. */
export function ensureDataDirs() {
  const targets = [config.dataDir, config.skillsDir, config.uploadsDir, config.opencode.directory];
  targets.push(path.dirname(config.databasePath));
  for (const dir of targets) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`[config] no se pudo crear ${dir}: ${error.message}`);
    }
  }
}

export default config;
