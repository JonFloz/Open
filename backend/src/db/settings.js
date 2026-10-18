import { db, now } from './sqlite.js';

const select = db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
const insert = db.prepare(
  `INSERT INTO user_settings (user_id, theme, default_model, default_agent, default_api_key_id, updated_at)
   VALUES (@user_id, @theme, @default_model, @default_agent, @default_api_key_id, @updated_at)`,
);
const update = db.prepare(
  `UPDATE user_settings
      SET theme = @theme,
          default_model = @default_model,
          default_agent = @default_agent,
          default_api_key_id = @default_api_key_id,
          updated_at = @updated_at
    WHERE user_id = @user_id`,
);

export function publicSettings(row) {
  return {
    theme: row?.theme ?? 'system',
    defaultModel: row?.default_model ?? null,
    defaultAgent: row?.default_agent ?? null,
    defaultApiKeyId: row?.default_api_key_id ?? null,
  };
}

export function getSettings(userId) {
  let row = select.get(userId);
  if (!row) {
    const timestamp = now();
    insert.run({
      user_id: userId,
      theme: 'system',
      default_model: null,
      default_agent: null,
      default_api_key_id: null,
      updated_at: timestamp,
    });
    row = select.get(userId);
  }
  return row;
}

export function updateSettings(userId, patch) {
  const current = getSettings(userId);
  const next = {
    user_id: userId,
    theme: patch.theme ?? current.theme,
    default_model: patch.defaultModel !== undefined ? patch.defaultModel : current.default_model,
    default_agent: patch.defaultAgent !== undefined ? patch.defaultAgent : current.default_agent,
    default_api_key_id:
      patch.defaultApiKeyId !== undefined ? patch.defaultApiKeyId : current.default_api_key_id,
    updated_at: now(),
  };
  update.run(next);
  return getSettings(userId);
}

export default { getSettings, updateSettings, publicSettings };
