import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import config, { ensureDataDirs } from '../config.js';
import { migrations } from './migrations.js';

ensureDataDirs();

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function closeDb() {
  try {
    db.close();
  } catch {
    /* la base ya estaba cerrada */
  }
}

/** Aplica las migraciones pendientes. */
export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id));
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      insert.run(migration.id, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migración ${migration.id} falló: ${error.message}`, { cause: error });
    }
  }
  return applied.size;
}

/** Genera un identificador con prefijo legible (`cnv_`, `msg_`, …). */
export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

export const now = () => new Date().toISOString();

migrate();

export default db;
