-- 0047 (PostgreSQL mirror): multiple company targets per task template.
BEGIN;
ALTER TABLE org_task_templates ADD COLUMN IF NOT EXISTS client_ids TEXT;
COMMIT;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'org_task_templates'
  AND column_name = 'client_ids';
