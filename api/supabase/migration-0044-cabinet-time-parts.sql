-- 0044 (miroir PostgreSQL) : partie entreprise / partie comptable pour le temps.
-- A appliquer dans le SQL Editor Supabase avant de deployer le Worker.
BEGIN;
ALTER TABLE org_task_templates ADD COLUMN IF NOT EXISTS part TEXT CHECK (part IN ('entreprise','comptable')) DEFAULT 'comptable';
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS part TEXT CHECK (part IN ('entreprise','comptable')) DEFAULT 'comptable';
COMMIT;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ( (table_name = 'org_task_templates' AND column_name = 'part')
     OR (table_name = 'org_tasks' AND column_name = 'part') )
ORDER BY table_name, column_name;
