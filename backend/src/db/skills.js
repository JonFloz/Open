import { db, newId, now } from './sqlite.js';

const listByUser = db.prepare('SELECT * FROM skills WHERE user_id = ? ORDER BY created_at ASC');
const selectById = db.prepare('SELECT * FROM skills WHERE id = ? AND user_id = ?');
const selectByName = db.prepare('SELECT * FROM skills WHERE user_id = ? AND name = ?');
const insert = db.prepare(
  `INSERT INTO skills (id, user_id, name, description, filename, source, size, created_at)
   VALUES (@id, @user_id, @name, @description, @filename, @source, @size, @created_at)`,
);
const updateRow = db.prepare(
  'UPDATE skills SET description = ?, source = ?, size = ? WHERE id = ? AND user_id = ?',
);
const remove = db.prepare('DELETE FROM skills WHERE id = ? AND user_id = ?');

export function publicSkill(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    filename: row.filename,
    source: row.source,
    size: row.size,
    createdAt: row.created_at,
  };
}

export function listSkills(userId) {
  return listByUser.all(userId).map(publicSkill);
}

export function findSkill(userId, id) {
  return selectById.get(id, userId) ?? null;
}

export function findSkillByName(userId, name) {
  return selectByName.get(userId, String(name)) ?? null;
}

export function upsertSkill(userId, { name, description, filename, source = 'manual', size = 0 }) {
  const existing = findSkillByName(userId, name);
  if (existing) {
    updateRow.run(description ?? existing.description, source, size, existing.id, userId);
    return findSkill(userId, existing.id);
  }
  const row = {
    id: newId('skl'),
    user_id: userId,
    name: String(name).slice(0, 120),
    description: description ?? '',
    filename,
    source,
    size,
    created_at: now(),
  };
  insert.run(row);
  return findSkill(userId, row.id);
}

export function deleteSkill(userId, id) {
  const row = findSkill(userId, id);
  if (!row) return null;
  remove.run(id, userId);
  return row;
}

export default { listSkills, findSkill, findSkillByName, upsertSkill, deleteSkill, publicSkill };
