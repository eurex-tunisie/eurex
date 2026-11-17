-- Miroir PostgreSQL de migrations/0053_user_hours_norm.sql (idempotent).
-- A appliquer AVANT la migration D1 correspondante.
ALTER TABLE org_users ADD COLUMN IF NOT EXISTS hours_norm_seconds BIGINT DEFAULT 30600;

UPDATE org_users SET hours_norm_seconds = 28800 WHERE id = '7e8b6a23da74dd238c0797bf50aa82c0';
