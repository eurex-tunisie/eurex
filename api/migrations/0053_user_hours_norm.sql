-- 0053 : norme d'heures configurable par utilisateur (defaut 8h30 = 30600s).
-- Abla (manager) = 8h = 28800s.
ALTER TABLE org_users ADD COLUMN hours_norm_seconds INTEGER DEFAULT 30600;

UPDATE org_users SET hours_norm_seconds = 28800 WHERE id = '7e8b6a23da74dd238c0797bf50aa82c0';
