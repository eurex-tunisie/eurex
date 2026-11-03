-- 0044 — honoraires / facturation client par dossier, distincts du coût salarial.
CREATE TABLE IF NOT EXISTS org_dossier_billing (
  dossier_id TEXT PRIMARY KEY,
  quoted_cents INTEGER,
  invoiced_cents INTEGER,
  collected_cents INTEGER,
  note TEXT,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_dossier_billing_updated ON org_dossier_billing(updated_at);

-- Norme temporelle spécifique à une entreprise, un exercice et une tâche.
CREATE TABLE IF NOT EXISTS org_dossier_task_norms (
  dossier_id TEXT NOT NULL,
  task_label TEXT NOT NULL,
  norm_seconds INTEGER NOT NULL,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (dossier_id, task_label)
);
CREATE INDEX IF NOT EXISTS idx_org_dossier_task_norms_dossier ON org_dossier_task_norms(dossier_id);
