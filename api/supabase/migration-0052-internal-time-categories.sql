-- Miroir PostgreSQL de migrations/0052_internal_time_categories.sql (idempotent).
-- A appliquer AVANT la migration D1 correspondante.
-- 1. Les categories deviennent libres (reunion, informatique + personnalisees) :
--    le CHECK de 0050 saute (cote SQLite la table est recreee, ici un DROP suffit).
ALTER TABLE org_internal_time_entries DROP CONSTRAINT IF EXISTS org_internal_time_entries_category_check;

-- 2. Categories personnalisees, partagees par cabinet.
CREATE TABLE IF NOT EXISTS org_internal_time_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_internal_time_categories_org ON org_internal_time_categories(organization_id);
