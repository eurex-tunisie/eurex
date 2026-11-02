-- 0043 — normes de temps par tâche et coûts horaires confidentiels du Cabinet.
-- NULL signifie « non renseigné » : ne jamais interpréter comme un coût nul.
ALTER TABLE org_users ADD COLUMN hourly_cost_cents INTEGER;
ALTER TABLE org_task_templates ADD COLUMN norm_seconds INTEGER;
ALTER TABLE org_tasks ADD COLUMN norm_seconds INTEGER;
