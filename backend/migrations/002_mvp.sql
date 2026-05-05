-- WhatsApp group whitelist
CREATE TABLE IF NOT EXISTS groups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id              TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  privacy_notice_sent  BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Persistent message store (all group messages)
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_name  TEXT NOT NULL,
  sender_phone TEXT,
  body         TEXT NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL,
  has_trigger  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extracted tasks and Basecamp sync status
CREATE TABLE IF NOT EXISTS tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  assignee         TEXT,
  deadline         DATE,
  project          TEXT,
  notes            TEXT,
  basecamp_todo_id TEXT,
  basecamp_url     TEXT,
  sync_status      TEXT NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly AI-generated summaries per group
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  week_end     DATE NOT NULL,
  summary_text TEXT NOT NULL,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_group_id     ON messages (group_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp    ON messages (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_has_trigger  ON messages (has_trigger) WHERE has_trigger = true;
CREATE INDEX IF NOT EXISTS idx_tasks_message_id      ON tasks (message_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sync_status     ON tasks (sync_status);
CREATE INDEX IF NOT EXISTS idx_summaries_group_week  ON weekly_summaries (group_id, week_start DESC);
