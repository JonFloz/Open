import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

/**
 * Test de integración HTTP: levanta la app real en un puerto efímero y recorre
 * el flujo de usuario (registro → login → rutas protegidas) sin necesitar un
 * servidor de OpenCode.
 */
const app = createApp();
const server = app.listen(0);
const { port } = server.address();

async function call(method, path, { body, token } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

test.after(() => server.close());

test('GET /api/health responde 200 y no requiere autenticación', async () => {
  const { status, payload } = await call('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.database, true);
});

test('las rutas protegidas exigen token', async () => {
  for (const path of ['/api/auth/me', '/api/keys', '/api/models', '/api/skills', '/api/conversations']) {
    const { status } = await call('GET', path);
    assert.equal(status, 401, `${path} debería requerir autenticación`);
  }
});

test('flujo completo: registrar, autenticar y operar', async () => {
  const email = `http${Date.now()}@example.com`;

  const register = await call('POST', '/api/auth/register', { body: { email, password: 'password123' } });
  assert.equal(register.status, 201);
  assert.ok(register.payload.token);
  assert.equal(register.payload.user.email, email);
  assert.equal(register.payload.user.password_hash, undefined);
  const token = register.payload.token;

  const duplicate = await call('POST', '/api/auth/register', { body: { email, password: 'password123' } });
  assert.equal(duplicate.status, 409);

  const invalid = await call('POST', '/api/auth/register', { body: { email, password: '123' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error.code, 'validation_error');

  const me = await call('GET', '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.payload.user.email, email);

  const login = await call('POST', '/api/auth/login', { body: { email, password: 'password123' } });
  assert.equal(login.status, 200);

  const badLogin = await call('POST', '/api/auth/login', { body: { email, password: 'incorrecta1' } });
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.payload.error.code, 'invalid_credentials');

  const created = await call('POST', '/api/keys', {
    token,
    body: { label: 'Personal', provider: 'opencode-go', key: 'oc_sk_1234567890abcdef' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.key.isDefault, true);

  const keys = await call('GET', '/api/keys', { token });
  assert.equal(keys.status, 200);
  assert.equal(keys.payload.keys.length, 1);
  assert.ok(!JSON.stringify(keys.payload).includes('oc_sk_1234567890abcdef'));

  const removed = await call('DELETE', `/api/keys/${keys.payload.keys[0].id}`, { token });
  assert.equal(removed.status, 200);
  assert.equal((await call('GET', '/api/keys', { token })).payload.keys.length, 0);

  const conversation = await call('POST', '/api/conversations', { token, body: { title: 'Hola' } });
  assert.equal(conversation.status, 201);
  const conversationId = conversation.payload.conversation.id;

  const listed = await call('GET', '/api/conversations', { token });
  assert.equal(listed.payload.conversations.length, 1);

  const detail = await call('GET', `/api/conversations/${conversationId}`, { token });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.payload.messages, []);

  const renamed = await call('PATCH', `/api/conversations/${conversationId}`, { token, body: { title: 'Nuevo' } });
  assert.equal(renamed.payload.conversation.title, 'Nuevo');

  const skill = await call('POST', '/api/skills', {
    token,
    body: { content: '---\nname: demo\ndescription: Demo\n---\n\n# Demo' },
  });
  assert.equal(skill.status, 201);
  assert.equal(skill.payload.skill.name, 'demo');
  assert.equal(skill.payload.skill.user_id, undefined);

  const skills = await call('GET', '/api/skills?content=1', { token });
  assert.equal(skills.payload.skills.length, 1);
  assert.match(skills.payload.skills[0].content, /# Demo/);

  const deleteSkill = await call('DELETE', `/api/skills/${skill.payload.skill.id}`, { token });
  assert.equal(deleteSkill.status, 200);

  const settings = await call('PATCH', '/api/settings', { token, body: { theme: 'dark' } });
  assert.equal(settings.status, 200);
  assert.equal(settings.payload.settings.theme, 'dark');

  const removedConversation = await call('DELETE', `/api/conversations/${conversationId}`, { token });
  assert.equal(removedConversation.status, 200);

  const logout = await call('POST', '/api/auth/logout', { token });
  assert.equal(logout.status, 200);
});

test('una ruta inexistente devuelve 404 con formato de error', async () => {
  const { status, payload } = await call('GET', '/api/no-existe');
  assert.equal(status, 404);
  assert.equal(payload.error.code, 'not_found');
});

test('el token manipulado se rechaza con 401', async () => {
  const { status, payload } = await call('GET', '/api/auth/me', { token: 'eyJhbGciOiJIUzI1NiJ9.falso.firma' });
  assert.equal(status, 401);
  assert.equal(payload.error.code, 'invalid_token');
});
