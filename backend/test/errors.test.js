import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenCodeRequestError, mapOpenCodeError, parseModelRef } from '../src/services/opencodeClient.js';

test('401 → 401 con mensaje de API key inválida', () => {
  const mapped = mapOpenCodeError({ status: 401, message: 'nope' });
  assert.equal(mapped.status, 401);
  assert.equal(mapped.code, 'unauthorized');
  assert.match(mapped.message, /API key inválida/i);
});

test('403 → 403 sin permisos', () => {
  const mapped = mapOpenCodeError({ response: { status: 403 } });
  assert.equal(mapped.status, 403);
  assert.equal(mapped.code, 'forbidden');
});

test('429 → 429 con Retry-After', () => {
  const mapped = mapOpenCodeError({
    status: 429,
    response: { status: 429, headers: { get: () => '12' } },
  });
  assert.equal(mapped.status, 429);
  assert.equal(mapped.code, 'rate_limited');
  assert.equal(mapped.retryAfter, '12');
});

test('500 de OpenCode → 502 Bad Gateway genérico', () => {
  const mapped = mapOpenCodeError({ status: 500, message: 'stacktrace interno' });
  assert.equal(mapped.status, 502);
  assert.equal(mapped.code, 'bad_gateway');
  assert.ok(!mapped.message.includes('stacktrace'));
});

test('errores de red sin status → 502 con el mensaje original', () => {
  const mapped = mapOpenCodeError(new Error('fetch failed'));
  assert.equal(mapped.status, 502);
  assert.match(mapped.message, /fetch failed/);
});

test('TypeError interno → 500 (no se disfraza de error de OpenCode)', () => {
  const mapped = mapOpenCodeError(new TypeError('client.x is not a function'));
  assert.equal(mapped.status, 500);
  assert.equal(mapped.code, 'internal_error');
});

test('un OpenCodeRequestError se devuelve tal cual', () => {
  const original = new OpenCodeRequestError('boom', { status: 418, code: 'teapot' });
  assert.equal(mapOpenCodeError(original), original);
});

test('parseModelRef convierte provider/model', () => {
  assert.deepEqual(parseModelRef('opencode-go/deepseek-v4.1-flash'), {
    providerID: 'opencode-go',
    id: 'deepseek-v4.1-flash',
  });
  assert.equal(parseModelRef('sin-separador'), null);
  assert.equal(parseModelRef(''), null);
  assert.equal(parseModelRef(null), null);
});
