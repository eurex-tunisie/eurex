-- 0052 : categories de temps interne editables (reunion/informatique + personnalisées)
-- 1. Suppression du CHECK sur category (recreation de la table, donnees preservees)
CREATE TABLE IF NOT EXISTS org_internal_time_entries_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL,
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  duration_seconds INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO org_internal_time_entries_new (id, user_id, organization_id, category, started_at, stopped_at, duration_seconds, note, created_at)
  SELECT id, user_id, organization_id, category, started_at, stopped_at, duration_seconds, note, created_at FROM org_internal_time_entries;
DROP TABLE org_internal_time_entries;
ALTER TABLE org_internal_time_entries_new RENAME TO org_internal_time_entries;
CREATE INDEX IF NOT EXISTS idx_internal_time_user ON org_internal_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_time_active ON org_internal_time_entries(user_id, stopped_at) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_internal_time_started ON org_internal_time_entries(started_at);

-- 2. Table des categories personnalisees (par organisation)
CREATE TABLE IF NOT EXISTS org_internal_time_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_internal_time_categories_org ON org_internal_time_categories(organization_id);
