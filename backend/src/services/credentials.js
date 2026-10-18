import config from '../config.js';
import { connectCredential } from './opencodeClient.js';

/**
 * Sincroniza la API key de un usuario con el servidor de OpenCode.
 *
 * Las credenciales del servidor de OpenCode son globales (no por sesión), así
 * que la activación se serializa en una cola para evitar que dos peticiones
 * concurrentes se pisen al cambiar la credencial activa.
 */

let activationQueue = Promise.resolve();
const activeByUser = new Map();

/**
 * Activa (o registra) la credencial del usuario.
 * @param {{userId: string, apiKey: string|null, integrationID?: string}} options
 */
export async function ensureUserCredential({ userId, apiKey, integrationID }) {
  if (!apiKey) return { applied: false, reason: 'no_api_key' };

  const integration = integrationID ?? config.opencode.credentialIntegration;
  const cacheKey = `${integration}|${userId}`;
  if (activeByUser.get(cacheKey) === apiKey) {
    return { applied: true, cached: true, integrationID: integration };
  }

  const task = activationQueue.then(async () => {
    const result = await connectCredential({
      integrationID: integration,
      key: apiKey,
      label: 'OpenCode Web Chat',
      activate: true,
    });
    activeByUser.set(cacheKey, apiKey);
    return result;
  });

  // La cola nunca debe romperse por un fallo puntual.
  activationQueue = task.catch(() => {});
  try {
    const result = await task;
    return { applied: true, integrationID: integration, ...result };
  } catch (error) {
    activeByUser.delete(cacheKey);
    return { applied: false, reason: 'credential_failed', error: error.message };
  }
}

/** Olvida la credencial cacheada (al borrar o cambiar una API key). */
export function forgetUserCredential(userId) {
  for (const key of [...activeByUser.keys()]) {
    if (key.endsWith(`|${userId}`)) activeByUser.delete(key);
  }
}

export default { ensureUserCredential, forgetUserCredential };
