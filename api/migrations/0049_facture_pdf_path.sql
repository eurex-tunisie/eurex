-- Scan Flash : chemin du PDF source rattache a la facture
-- (ex: Z:\SCANFLASH\EXERCICE\2026\DOCS COMPTABLES\10-2026\Facture\VTE 68-10-26 FAC2610-00002472.pdf)
ALTER TABLE factures_scan ADD COLUMN pdf_path TEXT;
