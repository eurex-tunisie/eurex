-- 0042 : corrections durables sur les factures.
-- Une correction (date, hors caisse) est stockee par (dossier, numero_facture)
-- et survit a "Supprimer tout" + re-upload : elle est reappliquee a l'upload.
-- Cas reel : #5 (03/01), #58 (28/01), #48 SOGEPLAN (hors caisse).

CREATE TABLE IF NOT EXISTS facture_corrections (
  dossier_id TEXT NOT NULL,
  numero_facture TEXT NOT NULL,
  date_facture TEXT,
  hors_caisse INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (dossier_id, numero_facture)
);
