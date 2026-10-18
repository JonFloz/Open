import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config from '../config.js';
import { generateSecret } from './crypto.js';

/**
 * Gestor del servidor de OpenCode.
 *
 * Dos modos:
 *  1. Externo: se define `OPENCODE_BASE_URL` y el backend solo se conecta.
 *  2. Gestionado: si no hay URL, el backend arranca `opencode serve` como
 *     proceso hijo en 127.0.0.1:<OPENCODE_PORT> (el "nota crítica" del plan:
 *     el servidor vive en la misma instancia que la API).
 */

const state = {
  baseUrl: null,
  password: null,
  managed: false,
  ready: false,
  version: null,
  error: null,
  startedAt: null,
};

let child = null;
let starting = null;
let logBuffer = [];

/**
 * Localiza el binario de OpenCode. El orden importa:
 *  1. `OPENCODE_BIN` (ruta explícita).
 *  2. La instalación del CLI que trae `@opencode/cli` como dependencia
 *     (`node_modules/.bin/opencode`) — así funciona en Render sin instalar nada.
 *  3. La instalación global del usuario (`~/.opencode/bin/opencode`).
 *  4. `opencode` en el PATH.
 */
export function resolveBinary() {
  const fromEnv = process.env.OPENCODE_BIN;
  if (fromEnv) return fromEnv;

  const candidates = [
    path.join(config.rootDir, 'node_modules', '.bin', 'opencode'),
    path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
    '/usr/local/bin/opencode',
    '/usr/bin/opencode',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return config.opencode.bin || 'opencode';
}

function basicAuth(password) {
  return `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
}

export function authHeaders() {
  const headers = { 'content-type': 'application/json' };
  if (state.password) headers.authorization = basicAuth(state.password);
  return headers;
}

export function serverStatus() {
  return {
    baseUrl: state.baseUrl,
    managed: state.managed,
    ready: state.ready,
    version: state.version,
    startedAt: state.startedAt,
    error: state.error,
    pid: child?.pid ?? null,
    binary: resolveBinary(),
  };
}

export function serverLogs(lines = 25) {
  return logBuffer.slice(-lines);
}

function pushLog(line) {
  const text = String(line).trimEnd();
  if (!text) return;
  logBuffer.push(text);
  if (logBuffer.length > 200) logBuffer = logBuffer.slice(-200);
}

export function serverUrl() {
  if (!state.baseUrl) throw new Error('El servidor de OpenCode todavía no está listo');
  return state.baseUrl;
}

/** Comprueba que el servidor responde y autentica. */
export async function ping({ timeout = 5000 } = {}) {
  if (!state.baseUrl) return { ok: false, error: 'not_started' };
  try {
    const response = await fetch(`${state.baseUrl}/api/info`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: await safeError(response) };
    }
    const info = await response.json();
    state.ready = true;
    state.version = info.version ?? state.version;
    return { ok: true, info, status: 200 };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function safeError(response) {
  try {
    const body = await response.json();
    return body?.message ?? body?._tag ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Arranca `opencode serve` y espera a que esté disponible.
 * @returns {Promise<{baseUrl: string, password: string}>}
 */
function spawnServer() {
  const { port, hostname, directory, startupTimeout } = config.opencode;
  const bin = resolveBinary();
  // Si el usuario aportó una contraseña la respetamos; si no, generamos una.
  const password = config.opencode.password || generateSecret(24);

  pushLog(`[server] arrancando "${bin} serve --port ${port} --hostname ${hostname}" en ${directory}`);

  child = spawn(bin, ['serve', '--port', String(port), '--hostname', hostname], {
    cwd: directory,
    env: {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: password,
      // Evita que el servidor hijo intente registrarse como servicio compartido.
      OPENCODE_DISABLE_SERVICE_REGISTRATION: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => pushLog(chunk));
  child.stderr.on('data', (chunk) => pushLog(chunk));
  child.on('exit', (code, signal) => {
    pushLog(`[server] el proceso terminó (code=${code}, signal=${signal})`);
    state.ready = false;
    state.error = `El servidor de OpenCode terminó (code=${code}, signal=${signal})`;
    child = null;
  });
  child.on('error', (error) => {
    pushLog(`[server] error al arrancar: ${error.message}`);
    state.error = error.message;
  });

  state.baseUrl = `http://${hostname}:${port}`;
  state.password = password;
  state.managed = true;

  const deadline = Date.now() + startupTimeout;
  return {
    async waitReady() {
      while (Date.now() < deadline) {
        const result = await ping({ timeout: 3000 });
        if (result.ok) {
          state.startedAt = new Date().toISOString();
          return { baseUrl: state.baseUrl, password: state.password };
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      throw new Error(
        `El servidor de OpenCode no respondió en ${startupTimeout} ms. Últimas líneas:\n${serverLogs(10).join('\n')}`,
      );
    },
  };
}

/** Garantiza que hay un servidor de OpenCode utilizable (idempotente). */
export function ensureServer() {
  if (starting) return starting;
  starting = (async () => {
    if (state.baseUrl && state.ready) return { baseUrl: state.baseUrl, password: state.password };

    if (config.opencode.baseUrl) {
      state.baseUrl = config.opencode.baseUrl.replace(/\/+$/, '');
      state.password = config.opencode.password || null;
      state.managed = false;
      const result = await ping({ timeout: 8000 });
      if (!result.ok) {
        state.error = `No se pudo conectar a OPENCODE_BASE_URL (${state.baseUrl}): ${result.error ?? result.status}`;
        throw new Error(state.error);
      }
      state.startedAt = new Date().toISOString();
      pushLog(`[server] conectado a servidor externo ${state.baseUrl}`);
      return { baseUrl: state.baseUrl, password: state.password };
    }

    if (!config.opencode.autostart) {
      throw new Error(
        'No hay OPENCODE_BASE_URL y OPENCODE_AUTOSTART está desactivado: no hay servidor de OpenCode disponible.',
      );
    }

    const started = spawnServer();
    return started.waitReady();
  })().finally(() => {
    starting = null;
  });
  return starting;
}

/** Detiene el servidor gestionado (no toca servidores externos). */
export async function stopServer() {
  if (!state.managed || !child) return;
  const process_ = child;
  child = null;
  state.ready = false;
  await new Promise((resolve) => {
    process_.once('exit', resolve);
    process_.kill('SIGTERM');
    setTimeout(() => {
      if (!process_.killed) process_.kill('SIGKILL');
      resolve();
    }, 5000).unref?.();
  });
}

export default { ensureServer, stopServer, serverStatus, serverUrl, ping, authHeaders, serverLogs, resolveBinary };
