import bcrypt from 'bcryptjs';
import config from '../config.js';
import { db, newId, now } from './sqlite.js';

const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const selectByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUser = db.prepare(
  'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (@id, @email, @password_hash, @created_at, @updated_at)',
);
const updatePassword = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');

/** Normaliza el email para comparaciones y almacenamiento. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, config.bcryptRounds);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password ?? ''), String(hash ?? ''));
}

/** Serializa un usuario para la API (nunca expone el hash). */
export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, createdAt: user.created_at, updatedAt: user.updated_at };
}

export function findUserById(id) {
  return selectById.get(id) ?? null;
}

export function findUserByEmail(email) {
  return selectByEmail.get(normalizeEmail(email)) ?? null;
}

export function createUser({ email, password }) {
  const normalized = normalizeEmail(email);
  if (findUserByEmail(normalized)) {
    const error = new Error('Ya existe una cuenta con ese email');
    error.status = 409;
    error.code = 'email_taken';
    throw error;
  }
  const timestamp = now();
  const user = {
    id: newId('usr'),
    email: normalized,
    password_hash: hashPassword(password),
    created_at: timestamp,
    updated_at: timestamp,
  };
  insertUser.run(user);
  return findUserById(user.id);
}

export function changePassword(userId, password) {
  updatePassword.run(hashPassword(password), now(), userId);
  return findUserById(userId);
}

export default { createUser, findUserById, findUserByEmail, publicUser, hashPassword, verifyPassword, normalizeEmail };
