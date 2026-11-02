-- 0043 (miroir PostgreSQL) : normes de temps et coûts horaires privés du Cabinet.
-- À appliquer dans le SQL Editor Supabase avant de déployer le Worker.
-- Le coût est nullable : un dossier avec un taux manquant reste « incomplet ».
BEGIN;
ALTER TABLE org_users ADD COLUMN IF NOT EXISTS hourly_cost_cents BIGINT;
ALTER TABLE org_task_templates ADD COLUMN IF NOT EXISTS norm_seconds BIGINT;
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS norm_seconds BIGINT;
COMMIT;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ( (table_name = 'org_users' AND column_name = 'hourly_cost_cents')
     OR (table_name = 'org_task_templates' AND column_name = 'norm_seconds')
     OR (table_name = 'org_tasks' AND column_name = 'norm_seconds') )
ORDER BY table_name, column_name;
