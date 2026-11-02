-- 0042 (miroir PostgreSQL) : corrections durables sur les factures.
-- Idempotent.

BEGIN;
CREATE TABLE IF NOT EXISTS facture_corrections (
  dossier_id TEXT NOT NULL,
  numero_facture TEXT NOT NULL,
  date_facture TEXT,
  hors_caisse INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (dossier_id, numero_facture)
);
COMMIT;
