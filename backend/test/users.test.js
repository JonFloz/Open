import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser, findUserByEmail, publicUser, verifyPassword } from '../src/db/users.js';

test('createUser guarda el email normalizado y hashea la contraseña', () => {
  const user = createUser({ email: '  Ada@Example.COM ', password: 'password123' });
  assert.equal(user.email, 'ada@example.com');
  assert.notEqual(user.password_hash, 'password123');
  assert.match(user.password_hash, /^\$2[aby]\$/);
  assert.equal(publicUser(user).password_hash, undefined);
});

test('verifyPassword acepta la correcta y rechaza la incorrecta', () => {
  const user = findUserByEmail('ada@example.com');
  assert.equal(verifyPassword('password123', user.password_hash), true);
  assert.equal(verifyPassword('otra-cosa', user.password_hash), false);
});

test('findUserByEmail no distingue mayúsculas ni espacios', () => {
  assert.ok(findUserByEmail(' ADA@example.com '));
});

test('createUser rechaza emails duplicados con status 409', () => {
  assert.throws(
    () => createUser({ email: 'ada@example.com', password: 'password123' }),
    (error) => error.status === 409 && error.code === 'email_taken',
  );
});
