import { db, newId, now } from './sqlite.js';

const listByUser = db.prepare(
  'SELECT id, title, model, agent, opencode_session_id, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
);
const selectById = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?');
const insert = db.prepare(
  `INSERT INTO conversations (id, user_id, title, model, agent, opencode_session_id, created_at, updated_at)
   VALUES (@id, @user_id, @title, @model, @agent, @opencode_session_id, @created_at, @updated_at)`,
);
const touch = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
const updateSession = db.prepare('UPDATE conversations SET opencode_session_id = ?, updated_at = ? WHERE id = ?');
const updateTitle = db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?');
const remove = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?');

const listMessages = db.prepare(
  'SELECT id, role, content, reasoning, model, meta, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
);
const insertMessage = db.prepare(
  `INSERT INTO messages (id, conversation_id, role, content, reasoning, model, meta, created_at)
   VALUES (@id, @conversation_id, @role, @content, @reasoning, @model, @meta, @created_at)`,
);

export function publicConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    agent: row.agent,
    opencodeSessionId: row.opencode_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicMessage(row) {
  if (!row) return null;
  let meta = null;
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta);
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning ?? null,
    model: row.model ?? null,
    meta,
    createdAt: row.created_at,
  };
}

export function listConversations(userId) {
  return listByUser.all(userId).map(publicConversation);
}

export function findConversation(userId, id) {
  return selectById.get(id, userId) ?? null;
}

export function createConversation(userId, { title = 'Nueva conversación', model = null, agent = null } = {}) {
  const timestamp = now();
  const row = {
    id: newId('cnv'),
    user_id: userId,
    title: String(title).slice(0, 120),
    model,
    agent,
    opencode_session_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  insert.run(row);
  return findConversation(userId, row.id);
}

export function attachOpenCodeSession(conversationId, opencodeSessionId) {
  updateSession.run(opencodeSessionId, now(), conversationId);
}

export function renameConversation(userId, id, title) {
  updateTitle.run(String(title).slice(0, 120), now(), id, userId);
  return findConversation(userId, id);
}

export function deleteConversation(userId, id) {
  return remove.run(id, userId).changes > 0;
}

export function touchConversation(id) {
  touch.run(now(), id);
}

export function getMessages(userId, conversationId) {
  const conversation = findConversation(userId, conversationId);
  if (!conversation) return null;
  return listMessages.all(conversationId).map(publicMessage);
}

export function addMessage(conversationId, { role, content, reasoning = null, model = null, meta = null }) {
  const row = {
    id: newId('msg'),
    conversation_id: conversationId,
    role,
    content: content ?? '',
    reasoning,
    model,
    meta: meta ? JSON.stringify(meta) : null,
    created_at: now(),
  };
  insertMessage.run(row);
  touchConversation(conversationId);
  return publicMessage(row);
}

export default {
  listConversations,
  createConversation,
  findConversation,
  renameConversation,
  deleteConversation,
  attachOpenCodeSession,
  getMessages,
  addMessage,
  publicConversation,
  publicMessage,
};
