-- Miroir PostgreSQL de migrations/0049_facture_pdf_path.sql (idempotent).
-- A appliquer AVANT la migration D1 correspondante.
ALTER TABLE factures_scan ADD COLUMN IF NOT EXISTS pdf_path TEXT;
