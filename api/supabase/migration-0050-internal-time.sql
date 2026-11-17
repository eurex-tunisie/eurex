-- Miroir PostgreSQL de migrations/0050_internal_time.sql (idempotent).
-- A appliquer AVANT la migration D1 correspondante.
CREATE TABLE IF NOT EXISTS org_internal_time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('reunion','informatique')),
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  duration_seconds BIGINT DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_internal_time_user ON org_internal_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_time_active ON org_internal_time_entries(user_id, stopped_at) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_internal_time_started ON org_internal_time_entries(started_at);
