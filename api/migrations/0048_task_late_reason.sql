-- 0048 : motif de retard — tache terminee APRES la norme (module Cabinet).
-- Separe de blocked_reason (blocage client) : une tache finie peut porter le
-- motif de retard sans passer pour « bloquee ».
ALTER TABLE org_tasks ADD COLUMN late_reason TEXT;
