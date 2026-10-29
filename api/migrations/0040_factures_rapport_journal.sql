-- 0040 : un meme dossier peut contenir les 2 depots (VT C = depot 6, VT J.C = depot 7).
-- Chaque facture et chaque ligne du rapport "Vente par jour" est rattachee a son journal.

ALTER TABLE factures ADD COLUMN journal TEXT DEFAULT 'VT J.C';

-- La cle (dossier_id, date_jour) devient (dossier_id, journal, date_jour) : SQLite ne sait
-- pas modifier une contrainte UNIQUE, on recree la table.
CREATE TABLE IF NOT EXISTS rapport_modes_new (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL,
  journal TEXT NOT NULL DEFAULT 'VT J.C',
  date_jour TEXT NOT NULL,
  especes REAL DEFAULT 0,
  cheques REAL DEFAULT 0,
  tpe REAL DEFAULT 0,
  bonsAchat REAL DEFAULT 0,
  avoir REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(dossier_id, journal, date_jour)
);

INSERT INTO rapport_modes_new (id, dossier_id, journal, date_jour, especes, cheques, tpe, bonsAchat, avoir, credit, created_at)
  SELECT id, dossier_id, 'VT J.C', date_jour, especes, cheques, tpe, bonsAchat, avoir, credit, created_at
  FROM rapport_modes;

DROP TABLE rapport_modes;
ALTER TABLE rapport_modes_new RENAME TO rapport_modes;

CREATE INDEX IF NOT EXISTS idx_rapport_dossier ON rapport_modes(dossier_id);
CREATE INDEX IF NOT EXISTS idx_rapport_dossier_journal ON rapport_modes(dossier_id, journal);
CREATE INDEX IF NOT EXISTS idx_factures_dossier_journal ON factures(dossier_id, journal);
