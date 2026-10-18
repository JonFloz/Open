import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, encryptSecret, generateSecret, maskSecret } from '../src/services/crypto.js';

test('encryptSecret/decryptSecret hacen round-trip', () => {
  const secret = 'oc_sk_1234567890abcdefghijklmnop';
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.match(encrypted, /^v1:/);
  assert.equal(decryptSecret(encrypted), secret);
});

test('cada cifrado usa un IV distinto', () => {
  const secret = 'misma-clave';
  assert.notEqual(encryptSecret(secret), encryptSecret(secret));
});

test('decryptSecret falla si el texto está manipulado', () => {
  const encrypted = encryptSecret('secreto');
  const tampered = `${encrypted.slice(0, -4)}AAAA`;
  assert.throws(() => decryptSecret(tampered));
});

test('decryptSecret rechaza formatos desconocidos', () => {
  assert.throws(() => decryptSecret('no-es-un-secreto'), /formato desconocido/i);
});

test('encryptSecret exige texto', () => {
  assert.throws(() => encryptSecret(''), TypeError);
});

test('maskSecret no revela el secreto completo', () => {
  const masked = maskSecret('oc_sk_abcdefghijklmnop');
  assert.match(masked, /^oc_sk_a…mnop$/);
  assert.ok(!masked.includes('defghijkl'));
});

test('generateSecret produce valores únicos y con el tamaño esperado', () => {
  const a = generateSecret(24);
  const b = generateSecret(24);
  assert.notEqual(a, b);
  assert.ok(a.length >= 30);
});
