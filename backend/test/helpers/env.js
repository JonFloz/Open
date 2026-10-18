import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Aísla cada proceso de test: base de datos, skills y uploads en un directorio
 * temporal propio. Debe importarse ANTES que cualquier módulo de `src/`.
 */
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'owc-test-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(base, 'test.db');
process.env.SKILLS_DIR = path.join(base, 'skills');
process.env.UPLOADS_DIR = path.join(base, 'uploads');
process.env.DATA_DIR = base;
process.env.JWT_SECRET = 'test-jwt-secret-please-change';
process.env.ENCRYPTION_KEY = 'test-encryption-key-please-change';
process.env.BCRYPT_ROUNDS = '4';
process.env.OPENCODE_AUTOSTART = 'false';

export const testDir = base;

export function cleanup() {
  fs.rmSync(base, { recursive: true, force: true });
}
