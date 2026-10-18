import { OpenCode } from '@opencode/client';
import config from '../config.js';
import { ensureServer } from './opencodeServer.js';

/**
 * Cliente de OpenCode basado en el SDK oficial (@opencode/client, la librería
 * de la API HTTP de OpenCode V2).
 *
 * El cliente se cachea y solo se recrea cuando cambia la conexión con el
 * servidor (arranque, reinicio o cambio de contraseña).
 */

let cached = { key: null, client: null };

function authHeaders(password) {
  const headers = {};
  if (password) {
    headers.authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
  }
  return headers;
}

/** Devuelve el cliente del SDK conectado al servidor de OpenCode. */
export async function getClient() {
  const { baseUrl, password } = await ensureServer();
  const key = `${baseUrl}|${password ?? ''}`;
  if (cached.key !== key) {
    cached = {
      key,
      client: OpenCode.make({ baseUrl, headers: authHeaders(password) }),
    };
  }
  return cached.client;
}

/** Invalida el cliente cacheado (por ejemplo tras reiniciar el servidor). */
export function resetClient() {
  cached = { key: null, client: null };
}

/** Ubicación (directorio de proyecto) usada por defecto. */
export function defaultLocation() {
  return { directory: config.opencode.directory };
}

/**
 * Reintenta una operación hasta obtener un resultado no vacío.
 * Justo después de arrancar, el servidor de OpenCode puede devolver listas
 * vacías mientras carga la configuración de la ubicación.
 */
async function withRetry(operation, { attempts = 3, delay = 700, isEmpty = (value) => !value?.length } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await operation();
    if (!isEmpty(last)) return last;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return last;
}

// ---------------------------------------------------------------------------
// Operaciones de alto nivel
// ---------------------------------------------------------------------------

export async function listModels() {
  const client = await getClient();
  const result = await withRetry(() => client.model.list({ location: defaultLocation() }), {
    isEmpty: (value) => !value?.data?.length,
  });
  return (result?.data ?? []).map((model) => ({
    id: model.id,
    modelID: model.modelID ?? model.id,
    providerID: model.providerID,
    name: model.name ?? `${model.providerID}/${model.modelID ?? model.id}`,
    family: model.family ?? null,
    capabilities: model.capabilities ?? null,
    variants: (model.variants ?? []).map((variant) => variant.id ?? variant),
    cost: model.cost ?? null,
    released: model.released ?? null,
  }));
}

export async function defaultModel() {
  const client = await getClient();
  const result = await client.model.default({ location: defaultLocation() });
  return result ?? null;
}

export async function listAgents() {
  const client = await getClient();
  const result = await withRetry(() => client.agent.list({ location: defaultLocation() }), {
    isEmpty: (value) => !value?.data?.length,
  });
  return (result?.data ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name ?? agent.id,
    description: agent.description ?? '',
    mode: agent.mode ?? 'primary',
    hidden: Boolean(agent.hidden),
  }));
}

export async function listOpenCodeSkills() {
  const client = await getClient();
  const result = await client.skill.list({ location: defaultLocation() });
  return (result.data ?? []).map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description ?? '',
    path: skill.path,
    content: skill.content,
    source: 'opencode',
  }));
}

export async function listCommands() {
  const client = await getClient();
  const result = await withRetry(() => client.command.list({ location: defaultLocation() }), {
    isEmpty: (value) => !value?.data?.length,
  });
  return result?.data ?? [];
}

export async function listProviders() {
  const client = await getClient();
  const result = await client.provider.list();
  return result.data ?? [];
}

export async function serverInfo() {
  const client = await getClient();
  return client.server.info();
}

/**
 * Crea una sesión de OpenCode.
 * @param {{title?: string, model?: string|null, agent?: string|null}} options
 *        `model` en formato `providerID/modelID`.
 */
export async function createSession({ title, model, agent } = {}) {
  const client = await getClient();
  return client.session.create({
    title: title ?? null,
    agent: agent ?? config.opencode.defaultAgent,
    model: parseModelRef(model) ?? parseModelRef(config.opencode.defaultModel),
    location: defaultLocation(),
  });
}

/** Convierte `provider/model` en el `Model.Ref` que espera el SDK. */
export function parseModelRef(reference) {
  if (!reference) return null;
  if (typeof reference === 'object') return reference;
  const separator = String(reference).indexOf('/');
  if (separator === -1) return null;
  const providerID = reference.slice(0, separator);
  const id = reference.slice(separator + 1);
  if (!providerID || !id) return null;
  return { providerID, id };
}

export function modelToString(reference) {
  if (!reference) return null;
  return `${reference.providerID}/${reference.id}`;
}

export async function switchModel(sessionID, model) {
  const client = await getClient();
  const ref = parseModelRef(model);
  if (!ref) throw badRequest(`Modelo inválido: "${model}" (formato esperado provider/model)`);
  await client.session.switchModel({ sessionID, model: ref });
}

export async function switchAgent(sessionID, agent) {
  const client = await getClient();
  await client.session.switchAgent({ sessionID, agent });
}

/**
 * Envía un prompt a una sesión.
 * @param {{sessionID: string, text: string, files?: Array<{uri: string, name?: string}>, skills?: Array<{id: string}>}} input
 */
export async function prompt({ sessionID, text, files, skills }) {
  const client = await getClient();
  const body = { sessionID, text };
  if (files?.length) body.files = files;
  if (skills?.length) body.skills = skills;
  return client.session.prompt(body);
}

export async function listMessages(sessionID, { limit } = {}) {
  const client = await getClient();
  const result = await client.message.list(limit ? { sessionID, limit } : { sessionID });
  return result.data ?? [];
}

export async function interrupt(sessionID) {
  const client = await getClient();
  return client.session.interrupt({ sessionID });
}

export async function removeSession(sessionID) {
  const client = await getClient();
  return client.session.remove({ sessionID });
}

export async function listCredentials() {
  const client = await getClient();
  return client.credential.list();
}

/**
 * Generación de un solo turno. Se usa para comprobar de verdad que una
 * credencial funciona (si la key es inválida, OpenCode responde 401/403).
 */
export async function generateText({ prompt, model }) {
  const client = await getClient();
  const result = await client.generate.text({
    prompt,
    model: parseModelRef(model) ?? parseModelRef(config.opencode.defaultModel),
  });
  return result?.text ?? '';
}

/**
 * Registra (y activa) la API key personal de un usuario en el servidor de
 * OpenCode para que sus peticiones usen su propia credencial.
 */
export async function connectCredential({ integrationID, key, label, activate = true }) {
  const client = await getClient();
  const credentials = await client.credential.list();
  const existing = credentials.find(
    (credential) => credential.integrationID === integrationID && credential.value?.key === key,
  );
  if (existing) {
    if (activate && !existing.active) {
      await client.credential.activate({ credentialID: existing.id });
    }
    return { id: existing.id, created: false };
  }

  const created = await client.credential.create({
    integrationID,
    label: label ?? 'OpenCode Web Chat',
    value: { type: 'key', key },
    activate,
  });
  return { id: created.id, created: true };
}

/**
 * Errores conocidos de OpenCode que conviene explicar mejor al usuario.
 * El texto original se conserva y se añade una pista accionable.
 */
const ERROR_HINTS = [
  {
    match: /free models aren'?t available|abusive traffic from this ip/i,
    hint:
      ' Los modelos gratuitos están bloqueados desde la IP de este servidor (OpenCode lo hace por tráfico abusivo). ' +
      'Guarda tu API key de OpenCode Go en Ajustes → API keys y elige un modelo del proveedor «opencode-go».',
  },
  {
    match: /missing api key/i,
    hint: ' OpenCode no tiene ninguna credencial activa. Añade tu API key en Ajustes → API keys.',
  },
  {
    match: /model unavailable/i,
    hint: ' El modelo no está disponible: puede que la credencial no esté activa o que el modelo no exista.',
  },
];

/** Añade una pista accionable a los errores conocidos de OpenCode. */
export function humanizeError(message) {
  const text = String(message ?? '').trim();
  if (!text) return text;
  for (const { match, hint } of ERROR_HINTS) {
    if (match.test(text)) return `${text}${hint}`;
  }
  return text;
}

export class OpenCodeRequestError extends Error {
  constructor(message, { status = 502, code = 'opencode_error', retryAfter = null } = {}) {
    super(message);
    this.name = 'OpenCodeRequestError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function badRequest(message) {
  return new OpenCodeRequestError(message, { status: 400, code: 'invalid_request' });
}

/**
 * Traduce los errores del SDK a errores HTTP claros (sección 5.2 del plan).
 * @param {unknown} error
 * @returns {OpenCodeRequestError}
 */
export function mapOpenCodeError(error) {
  if (error instanceof OpenCodeRequestError) return error;

  const rawStatus =
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    error?.cause?.status ??
    null;
  const detail =
    error?.data?.message ??
    error?.response?.data?.message ??
    error?.data?._tag ??
    error?.cause?.message ??
    error?.message ??
    'Error desconocido al hablar con OpenCode';
  const retryAfter = error?.response?.headers?.get?.('retry-after') ?? error?.headers?.['retry-after'] ?? null;

  switch (Number(rawStatus)) {
    case 400:
      return new OpenCodeRequestError(`Petición inválida a OpenCode: ${detail}`, {
        status: 400,
        code: 'invalid_request',
      });
    case 401:
      return new OpenCodeRequestError(
        'API key inválida o expirada. Revisa tus credenciales en Ajustes.',
        { status: 401, code: 'unauthorized' },
      );
    case 403:
      return new OpenCodeRequestError('Sin permisos para el modelo o recurso solicitado.', {
        status: 403,
        code: 'forbidden',
      });
    case 404:
      return new OpenCodeRequestError(`Recurso no encontrado en OpenCode: ${detail}`, {
        status: 404,
        code: 'not_found',
      });
    case 409:
      return new OpenCodeRequestError(`Conflicto: ${detail}`, { status: 409, code: 'conflict' });
    case 429:
      return new OpenCodeRequestError('Límite de peticiones excedido. Inténtalo de nuevo en unos segundos.', {
        status: 429,
        code: 'rate_limited',
        retryAfter,
      });
    case 503:
      return new OpenCodeRequestError('El servidor de OpenCode no está disponible temporalmente.', {
        status: 503,
        code: 'unavailable',
      });
    default:
      if (Number(rawStatus) >= 500) {
        return new OpenCodeRequestError('El servidor de OpenCode devolvió un error interno.', {
          status: 502,
          code: 'bad_gateway',
        });
      }
      if (error instanceof TypeError) {
        return new OpenCodeRequestError(`Error interno del cliente de OpenCode: ${detail}`, {
          status: 500,
          code: 'internal_error',
        });
      }
      return new OpenCodeRequestError(detail, { status: 502, code: 'opencode_error' });
  }
}

export default {
  getClient,
  resetClient,
  listModels,
  defaultModel,
  listAgents,
  listOpenCodeSkills,
  listCommands,
  listProviders,
  serverInfo,
  createSession,
  prompt,
  listMessages,
  interrupt,
  removeSession,
  switchModel,
  switchAgent,
  connectCredential,
  listCredentials,
  generateText,
  parseModelRef,
  modelToString,
  mapOpenCodeError,
  humanizeError,
  OpenCodeRequestError,
};
