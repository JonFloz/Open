import crypto from 'node:crypto';
import config from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const SALT = 'opencode-web-chat::api-keys';

/**
 * Deriva la clave de 32 bytes usada por AES-256 a partir de ENCRYPTION_KEY.
 * scrypt hace que la clave derivada sea costosa de calcular por fuerza bruta.
 */
function derivedKey() {
  return crypto.scryptSync(config.encryptionKey, SALT, 32);
}

/**
 * Cifra un secreto en reposo (por ejemplo la API key de OpenCode de un usuario).
 * Formato del resultado: `v1:<iv>:<tag>:<ciphertext>` (todo en base64url).
 */
export function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new TypeError('encryptSecret espera una cadena no vacía');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

/** Descifra un secreto creado con {@link encryptSecret}. */
export function decryptSecret(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(`${VERSION}:`)) {
    throw new Error('Secreto con formato desconocido');
  }
  const [, ivPart, tagPart, dataPart] = payload.split(':');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Secreto corrupto');
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
}

/** Oculta un secreto para mostrarlo en la UI: `oc_sk_abcd…wxyz`. */
export function maskSecret(secret) {
  if (typeof secret !== 'string' || secret.length === 0) return '';
  if (secret.length <= 10) return `${secret.slice(0, 2)}…`;
  return `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}

/** Genera un secreto aleatorio seguro (contraseñas de servidor, claves, etc.). */
export function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export default { encryptSecret, decryptSecret, maskSecret, generateSecret };
