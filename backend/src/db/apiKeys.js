import { decryptSecret, encryptSecret } from '../services/crypto.js';
import { db, newId, now } from './sqlite.js';

const listByUser = db.prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at ASC');
const selectById = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?');
const insert = db.prepare(
  `INSERT INTO api_keys (id, user_id, label, provider, key_encrypted, last4, is_default, created_at)
   VALUES (@id, @user_id, @label, @provider, @key_encrypted, @last4, @is_default, @created_at)`,
);
const removeStmt = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?');
const clearDefaults = db.prepare('UPDATE api_keys SET is_default = 0 WHERE user_id = ?');
const setDefaultStmt = db.prepare('UPDATE api_keys SET is_default = 1 WHERE id = ? AND user_id = ?');
const countByUser = db.prepare('SELECT COUNT(*) AS total FROM api_keys WHERE user_id = ?');

/** Versión pública de una key: sin el secreto descifrado. */
export function publicApiKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    masked: `••••${row.last4}`,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

export function listApiKeys(userId) {
  return listByUser.all(userId).map(publicApiKey);
}

export function findApiKeyRow(userId, id) {
  return selectById.get(id, userId) ?? null;
}

/** Devuelve la key descifrada (uso interno, nunca se envía al cliente). */
export function revealApiKey(row) {
  if (!row) return null;
  try {
    return decryptSecret(row.key_encrypted);
  } catch (error) {
    const wrapped = new Error('No se pudo descifrar la API key almacenada (¿cambió ENCRYPTION_KEY?)');
    wrapped.status = 500;
    wrapped.cause = error;
    throw wrapped;
  }
}

export function countApiKeys(userId) {
  return countByUser.get(userId)?.total ?? 0;
}

export function createApiKey(userId, { label, provider, key }) {
  const secret = String(key).trim();
  const makeDefault = countApiKeys(userId) === 0;
  const row = {
    id: newId('key'),
    user_id: userId,
    label: String(label ?? 'API key').trim() || 'API key',
    provider: String(provider ?? 'opencode').trim() || 'opencode',
    key_encrypted: encryptSecret(secret),
    last4: secret.slice(-4),
    is_default: makeDefault ? 1 : 0,
    created_at: now(),
  };
  insert.run(row);
  return publicApiKey(selectById.get(row.id, userId));
}

export function deleteApiKey(userId, id) {
  const row = selectById.get(id, userId);
  if (!row) return false;
  removeStmt.run(id, userId);
  if (row.is_default) {
    const [next] = listByUser.all(userId);
    if (next) setDefaultStmt.run(next.id, userId);
  }
  return true;
}

export function setDefaultApiKey(userId, id) {
  const row = selectById.get(id, userId);
  if (!row) return null;
  clearDefaults.run(userId);
  setDefaultStmt.run(id, userId);
  return publicApiKey(selectById.get(id, userId));
}

/** Primera key del usuario, usada como respaldo si no hay default. */
export function defaultApiKeyRow(userId) {
  const rows = listByUser.all(userId);
  return rows.find((row) => row.is_default) ?? rows[0] ?? null;
}

export default {
  listApiKeys,
  createApiKey,
  deleteApiKey,
  setDefaultApiKey,
  findApiKeyRow,
  defaultApiKeyRow,
  revealApiKey,
  publicApiKey,
  countApiKeys,
};
