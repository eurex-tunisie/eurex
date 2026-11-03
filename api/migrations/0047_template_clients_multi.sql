-- 0047 — allow a task template to target several companies.
ALTER TABLE org_task_templates ADD COLUMN client_ids TEXT;
