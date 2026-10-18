import './helpers/env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMessage,
  attachOpenCodeSession,
  createConversation,
  deleteConversation,
  findConversation,
  getMessages,
  listConversations,
  renameConversation,
} from '../src/db/conversations.js';
import { createUser } from '../src/db/users.js';

const user = createUser({ email: 'conv@example.com', password: 'password123' });
const other = createUser({ email: 'conv2@example.com', password: 'password123' });

test('crear, renombrar y adjuntar la sesión de OpenCode', () => {
  const conversation = createConversation(user.id, { title: 'Prueba', model: 'opencode-go/x', agent: 'build' });
  assert.equal(conversation.title, 'Prueba');
  assert.equal(conversation.opencode_session_id, null);

  attachOpenCodeSession(conversation.id, 'ses_123');
  const updated = findConversation(user.id, conversation.id);
  assert.equal(updated.opencode_session_id, 'ses_123');

  const renamed = renameConversation(user.id, conversation.id, 'Otro título');
  assert.equal(renamed.title, 'Otro título');
});

test('los mensajes se guardan y se devuelven en orden', () => {
  const [conversation] = listConversations(user.id);
  addMessage(conversation.id, { role: 'user', content: 'hola' });
  addMessage(conversation.id, { role: 'assistant', content: 'hola 👋', model: 'opencode-go/x', meta: { finish: 'stop' } });

  const messages = getMessages(user.id, conversation.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].content, 'hola 👋');
  assert.deepEqual(messages[1].meta, { finish: 'stop' });
});

test('un usuario no puede ver conversaciones de otro', () => {
  const [conversation] = listConversations(user.id);
  assert.equal(findConversation(other.id, conversation.id), null);
  assert.equal(getMessages(other.id, conversation.id), null);
  assert.equal(deleteConversation(other.id, conversation.id), false);
});

test('borrar una conversación elimina sus mensajes en cascada', () => {
  const [conversation] = listConversations(user.id);
  assert.equal(deleteConversation(user.id, conversation.id), true);
  assert.equal(findConversation(user.id, conversation.id), null);
  assert.equal(listConversations(user.id).length, 0);
});
