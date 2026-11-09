-- Miroir PostgreSQL de migrations/0048_task_late_reason.sql (idempotent).
-- A appliquer AVANT la migration D1 correspondante.
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS late_reason TEXT;
