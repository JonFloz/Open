import './helpers/env.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Ejecuta el módulo de configuración en un proceso hijo con un entorno
 * controlado, simulando un arranque de producción en Render.
 */
function boot({ dataDir, jwt, encryption }) {
  const env = { ...process.env, NODE_ENV: 'production', DATA_DIR: dataDir };
  if (jwt === undefined) delete env.JWT_SECRET;
  else env.JWT_SECRET = jwt;
  if (encryption === undefined) delete env.ENCRYPTION_KEY;
  else env.ENCRYPTION_KEY = encryption;

  const script = `
    const { config } = await import('./src/config.js');
    console.log(JSON.stringify({
      source: config.secretsSource,
      persisted: config.secretsPersisted,
      jwt: config.jwtSecret.slice(0, 12),
      encryption: config.encryptionKey.slice(0, 12),
      dataDir: config.dataDir,
      dataDirWritable: config.dataDirWritable,
    }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: backendDir,
    env,
    encoding: 'utf8',
  });
  const line = result.stdout.trim().split('\n').pop();
  return { status: result.status, stderr: result.stderr, output: line ? JSON.parse(line) : null };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'owc-secrets-'));
}

test('en producción sin variables de entorno genera y persiste los secretos', () => {
  const dataDir = tempDir();
  const run = boot({ dataDir });

  assert.equal(run.status, 0, `debería arrancar sin fallar. stderr: ${run.stderr}`);
  assert.equal(run.output.source, 'file');
  assert.equal(run.output.persisted, true);

  const file = path.join(dataDir, 'secrets.json');
  assert.ok(fs.existsSync(file), 'debería crear secrets.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'el fichero debe ser privado');

  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(stored.jwt.length >= 32);
  assert.ok(stored.encryption.length >= 32);
});

test('los secretos persistidos se reutilizan en arranques posteriores', () => {
  const dataDir = tempDir();
  const first = boot({ dataDir });
  const second = boot({ dataDir });

  assert.equal(first.output.jwt, second.output.jwt);
  assert.equal(first.output.encryption, second.output.encryption);
  assert.equal(second.output.source, 'file');
});

test('las variables de entorno tienen prioridad y no se escribe ningún fichero', () => {
  const dataDir = tempDir();
  const run = boot({ dataDir, jwt: 'jwt-de-entorno', encryption: 'clave-de-entorno' });

  assert.equal(run.status, 0);
  assert.equal(run.output.source, 'env');
  assert.equal(run.output.persisted, false);
  assert.equal(run.output.jwt, 'jwt-de-entor');
  assert.equal(fs.existsSync(path.join(dataDir, 'secrets.json')), false);
});

test('si solo falta una variable, la otra se respeta y solo se genera la ausente', () => {
  const dataDir = tempDir();
  const run = boot({ dataDir, jwt: 'jwt-de-entorno', encryption: undefined });

  assert.equal(run.status, 0);
  assert.equal(run.output.source, 'file');
  assert.equal(run.output.jwt, 'jwt-de-entor');

  const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'));
  assert.equal(stored.jwt, 'jwt-de-entorno');
  assert.notEqual(stored.encryption, 'jwt-de-entorno');
});

test('si el directorio de datos no es escribible cae al temporal y no aborta', () => {
  const requested = path.join('/proc', `no-escribible-${Date.now()}`);
  const run = boot({ dataDir: requested });

  assert.equal(run.status, 0, 'no debe abortar el arranque');
  assert.equal(run.output.dataDirWritable, false);
  assert.notEqual(run.output.dataDir, requested, 'debe usar el directorio temporal de respaldo');
  assert.ok(run.output.dataDir.includes('opencode-web-chat'));
});

test('un directorio de datos de solo lectura tampoco impide el arranque', () => {
  const dataDir = tempDir();
  const readOnly = path.join(dataDir, 'solo-lectura');
  fs.mkdirSync(readOnly, { recursive: true });
  fs.chmodSync(readOnly, 0o500);

  try {
    // Saltamos el test si corremos como root (root escribe en cualquier sitio).
    fs.accessSync(readOnly, fs.constants.W_OK);
    return;
  } catch {
    const run = boot({ dataDir: readOnly });
    assert.equal(run.status, 0, 'no debe abortar el arranque');
    assert.equal(run.output.dataDirWritable, false);
  } finally {
    fs.chmodSync(readOnly, 0o700);
  }
});
