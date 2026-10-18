import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialsSchema, promptSchema } from '../src/middleware/validate.js';

test('credentialsSchema valida email y contraseña mínima de 8 caracteres', () => {
  assert.equal(credentialsSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success, true);
  assert.equal(credentialsSchema.safeParse({ email: 'no-email', password: '12345678' }).success, false);
  assert.equal(credentialsSchema.safeParse({ email: 'a@b.com', password: '123' }).success, false);
});

test('credentialsSchema normaliza el email (trim + minúsculas)', () => {
  const result = credentialsSchema.parse({ email: '  USER@Example.COM ', password: 'password123' });
  assert.equal(result.email, 'user@example.com');
});

test('promptSchema exige texto no vacío y limita las imágenes a 5', () => {
  assert.equal(promptSchema.safeParse({ prompt: 'hola' }).success, true);
  assert.equal(promptSchema.safeParse({ prompt: '   ' }).success, false);
  assert.equal(promptSchema.safeParse({}).success, false);

  const images = Array.from({ length: 6 }, () => ({ data: 'x' }));
  assert.equal(promptSchema.safeParse({ prompt: 'hola', images }).success, false);
});

test('promptSchema acepta modelo, agente, skills y apiKeyId opcionales', () => {
  const result = promptSchema.parse({
    prompt: 'hola',
    conversationId: 'cnv_1',
    model: 'opencode-go/x',
    agent: 'build',
    skillIds: ['skl_1'],
    apiKeyId: 'key_1',
  });
  assert.equal(result.model, 'opencode-go/x');
  assert.deepEqual(result.skillIds, ['skl_1']);
  assert.equal(result.apiKeyId, 'key_1');
});
