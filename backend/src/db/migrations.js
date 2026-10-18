/**
 * Migraciones del esquema SQLite.
 * Cada entrada se aplica una sola vez y queda registrada en `schema_migrations`.
 */
export const migrations = [
  {
    id: '001_init',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label         TEXT NOT NULL,
        provider      TEXT NOT NULL,
        key_encrypted TEXT NOT NULL,
        last4         TEXT NOT NULL,
        is_default    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title               TEXT NOT NULL,
        model               TEXT,
        agent               TEXT,
        opencode_session_id TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL,
        reasoning       TEXT,
        model           TEXT,
        meta            TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme              TEXT NOT NULL DEFAULT 'system',
        default_model      TEXT,
        default_agent      TEXT,
        default_api_key_id TEXT,
        updated_at         TEXT NOT NULL
      );
    `,
  },
  {
    id: '002_skills',
    sql: `
      CREATE TABLE IF NOT EXISTS skills (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT,
        filename    TEXT NOT NULL,
        source      TEXT NOT NULL DEFAULT 'manual',
        size        INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_user_name ON skills(user_id, name);
    `,
  },
];
