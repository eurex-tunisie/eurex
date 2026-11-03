-- 0046 (miroir PostgreSQL) : facturation directe et normes par dossier/tâche.
-- À appliquer dans le SQL Editor Supabase avant de déployer le Worker.
BEGIN;
CREATE TABLE IF NOT EXISTS org_dossier_billing (
  dossier_id TEXT PRIMARY KEY,
  quoted_cents BIGINT,
  invoiced_cents BIGINT,
  collected_cents BIGINT,
  note TEXT,
  updated_by TEXT,
  updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_org_dossier_billing_updated ON org_dossier_billing(updated_at);

CREATE TABLE IF NOT EXISTS org_dossier_task_norms (
  dossier_id TEXT NOT NULL,
  task_label TEXT NOT NULL,
  norm_seconds BIGINT NOT NULL,
  updated_by TEXT,
  updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (dossier_id, task_label)
);
CREATE INDEX IF NOT EXISTS idx_org_dossier_task_norms_dossier ON org_dossier_task_norms(dossier_id);
ALTER TABLE org_time_entries ADD COLUMN IF NOT EXISTS part TEXT CHECK (part IN ('entreprise','comptable')) DEFAULT 'comptable';
COMMIT;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name IN ('org_dossier_billing', 'org_dossier_task_norms'))
    OR (table_name = 'org_time_entries' AND column_name = 'part'))
ORDER BY table_name, column_name;
