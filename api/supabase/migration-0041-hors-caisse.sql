-- 0041 (miroir PostgreSQL) : facture "hors caisse" (vente client / a credit).
-- A passer avant de deployer l'API (double ecriture D1 -> Supabase).
-- Idempotent.

BEGIN;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS hors_caisse INTEGER DEFAULT 0;
COMMIT;
