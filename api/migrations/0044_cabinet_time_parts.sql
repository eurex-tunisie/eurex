-- 0044 — partage du temps en partie entreprise / partie comptable.
-- Chaque tâche appartient à une seule partie (entreprise = sur place client,
-- comptable = au cabinet). NULL est normalisé en 'comptable' au niveau applicatif.
ALTER TABLE org_task_templates ADD COLUMN part TEXT CHECK (part IN ('entreprise','comptable')) DEFAULT 'comptable';
ALTER TABLE org_tasks ADD COLUMN part TEXT CHECK (part IN ('entreprise','comptable')) DEFAULT 'comptable';
