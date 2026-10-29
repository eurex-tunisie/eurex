-- 0041 : marquer une facture "hors caisse" (vente client / a credit).
-- Ces factures restent des ventes, mais ne sont pas encaissees au comptoir :
-- elles partent en compte client 411000 et ne faussent plus l'ecart 634500.
-- Cas reel : SOGEPLAN 2026/48 et 2026/49 (24/01/2026, ANIMAL CITY).

ALTER TABLE factures ADD COLUMN hors_caisse INTEGER DEFAULT 0;
