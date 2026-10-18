import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countApiKeys,
  createApiKey,
  defaultApiKeyRow,
  deleteApiKey,
  listApiKeys,
  revealApiKey,
  setDefaultApiKey,
} from '../src/db/apiKeys.js';
import { createUser } from '../src/db/users.js';

const user = createUser({ email: 'keys@example.com', password: 'password123' });

test('la primera key queda como predeterminada y se lista enmascarada', () => {
  const first = createApiKey(user.id, { label: 'Personal', provider: 'opencode-go', key: 'oc_sk_aaaa1111bbbb' });
  assert.equal(first.isDefault, true);
  assert.match(first.masked, /^••••bbbb$/);
  assert.equal(first.key, undefined);
  assert.equal(countApiKeys(user.id), 1);
});

test('segunda key no es predeterminada', () => {
  const second = createApiKey(user.id, { label: 'Trabajo', provider: 'opencode', key: 'oc_sk_cccc2222dddd' });
  assert.equal(second.isDefault, false);
  assert.equal(countApiKeys(user.id), 2);
});

test('la key se puede descifrar para usarla contra OpenCode', () => {
  const row = defaultApiKeyRow(user.id);
  assert.equal(revealApiKey(row), 'oc_sk_aaaa1111bbbb');
});

test('revocar la predeterminada promociona la siguiente', () => {
  const row = defaultApiKeyRow(user.id);
  assert.equal(deleteApiKey(user.id, row.id), true);
  const next = defaultApiKeyRow(user.id);
  assert.equal(next.label, 'Trabajo');
  assert.equal(next.is_default, 1);
});

test('setDefaultApiKey cambia la predeterminada', () => {
  const extra = createApiKey(user.id, { label: 'Extra', provider: 'otro', key: 'oc_sk_eeee3333ffff' });
  const updated = setDefaultApiKey(user.id, extra.id);
  assert.equal(updated.isDefault, true);
  assert.equal(listApiKeys(user.id).filter((key) => key.isDefault).length, 1);
});

test('no se puede borrar una key de otro usuario', () => {
  const other = createUser({ email: 'otros@example.com', password: 'password123' });
  const [mine] = listApiKeys(user.id);
  assert.equal(deleteApiKey(other.id, mine.id), false);
  assert.ok(listApiKeys(user.id).some((key) => key.id === mine.id));
});
