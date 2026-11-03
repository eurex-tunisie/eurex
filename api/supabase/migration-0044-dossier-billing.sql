-- 0044 (miroir PostgreSQL) : saisie honoraires prévus/facturés/encaissés par dossier.
BEGIN;
CREATE TABLE IF NOT EXISTS org_dossier_billing (
  dossier_id TEXT PRIMARY KEY,
  quoted_cents BIGINT,
  invoiced_cents BIGINT,
  collected_cents BIGINT,
  note TEXT,
  updated_by TEXT,
  updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_org_dossier_billing_updated ON org_dossier_billing(updated_at);
CREATE TABLE IF NOT EXISTS org_dossier_task_norms (
  dossier_id TEXT NOT NULL,
  task_label TEXT NOT NULL,
  norm_seconds BIGINT NOT NULL,
  updated_by TEXT,
  updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (dossier_id, task_label)
);
CREATE INDEX IF NOT EXISTS idx_org_dossier_task_norms_dossier ON org_dossier_task_norms(dossier_id);
COMMIT;
