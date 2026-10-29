-- 0040 (miroir PostgreSQL) : un meme dossier peut contenir les 2 depots
-- (VT C = depot 6, VT J.C = depot 7). Chaque facture et chaque ligne du
-- rapport "Vente par jour" est rattachee a son journal.
--
-- A passer dans le SQL Editor Supabase AVANT de deployer l'API, sinon la
-- double ecriture (D1 -> Supabase) echouera sur la colonne "journal".
-- Idempotent : peut etre relance sans risque.

BEGIN;

ALTER TABLE factures ADD COLUMN IF NOT EXISTS journal TEXT DEFAULT 'VT J.C';
ALTER TABLE rapport_modes ADD COLUMN IF NOT EXISTS journal TEXT NOT NULL DEFAULT 'VT J.C';

-- La cle (dossier_id, date_jour) devient (dossier_id, journal, date_jour).
ALTER TABLE rapport_modes DROP CONSTRAINT IF EXISTS rapport_modes_dossier_id_date_jour_key;
ALTER TABLE rapport_modes ADD CONSTRAINT rapport_modes_dossier_journal_date_uk UNIQUE (dossier_id, journal, date_jour);

CREATE INDEX IF NOT EXISTS idx_rapport_dossier_journal ON rapport_modes(dossier_id, journal);
CREATE INDEX IF NOT EXISTS idx_factures_dossier_journal ON factures(dossier_id, journal);

COMMIT;
