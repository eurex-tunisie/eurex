-- ============================================================
-- RATTRAPAGE DU SCHEMA SUPABASE : migrations D1 0035 -> 0038
-- ============================================================
-- `api/supabase/schema.sql` a ete genere le 2026-10-09 a partir des
-- migrations D1 jusqu'a 0034. Les migrations 0035 a 0038, appliquees a D1
-- depuis, n'ont jamais ete repercutees sur la copie PostgreSQL.
--
-- Consequence constatee en production le 2026-10-18 (logs du Worker) :
--
--   (error) lecture repartie indisponible, repli sur D1 :
--           column c.deleted_at does not exist
--
-- Chaque lecture confiee a Supabase echouait donc sur `org_clients` et
-- retombait sur D1 : la repartition des lectures ne servait plus a rien, et
-- surtout, en cas de bascule automatique sur Supabase (quota D1 epuise), la
-- page Clients aurait ete cassee au lieu de secourir l'application.
--
-- 0039 (seed de documents) est une migration de DONNEES : les lignes ont ete
-- ecrites dans D1 puis doublees vers Supabase par la double ecriture. Ne pas
-- rejouer 0039 ici, sous peine de doublons.
--
-- Idempotent : re-executable sans risque (ADD COLUMN IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS).
--
-- A executer dans Supabase : Dashboard -> SQL Editor -> New query
-- (option A de api/supabase/README.md), ou :
--   psql "$SUPABASE_DB_URL" -f api/supabase/rattrapage-0035-0038.sql
-- ============================================================

-- --- 0035 : six index perdus par la reconstruction de 0025 ---------------
-- Sans eux, les lectures servies par Supabase balaient org_tasks en entier.
CREATE INDEX IF NOT EXISTS idx_org_tasks_dossier ON org_tasks(dossier_id);
CREATE INDEX IF NOT EXISTS idx_org_tasks_status ON org_tasks(dossier_id, status);
CREATE INDEX IF NOT EXISTS idx_org_tasks_assigned ON org_tasks(assigned_comptable_id);
CREATE INDEX IF NOT EXISTS idx_org_tasks_month ON org_tasks(dossier_id, month);
CREATE INDEX IF NOT EXISTS idx_org_expected_docs_dossier ON org_expected_documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_org_expected_docs_received ON org_expected_documents(dossier_id, received);

-- --- 0036 : tri des taches recentes --------------------------------------
CREATE INDEX IF NOT EXISTS idx_org_tasks_created ON org_tasks(created_at, id);

-- --- 0037 : corbeille client + portail client ----------------------------
-- `deleted_at` est LA colonne dont l'absence faisait echouer /org/clients.
ALTER TABLE org_clients ADD COLUMN IF NOT EXISTS deleted_at text;
ALTER TABLE org_clients ADD COLUMN IF NOT EXISTS portal_token text;
CREATE INDEX IF NOT EXISTS idx_org_clients_deleted ON org_clients(organization_id, deleted_at);
-- Unique : si la copie contenait deja deux jetons identiques, cette ligne
-- echouera et le reste du script sera annule — verifier avant avec
--   SELECT portal_token, COUNT(*) FROM org_clients
--   WHERE portal_token IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_clients_portal ON org_clients(portal_token);

-- --- 0038 : comptable responsable d'un dossier ---------------------------
ALTER TABLE org_dossiers ADD COLUMN IF NOT EXISTS assigned_comptable_id text REFERENCES org_users(id);
CREATE INDEX IF NOT EXISTS idx_org_dossiers_assigned ON org_dossiers(assigned_comptable_id);

-- --- Controle : les colonnes doivent apparaitre ici ----------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'org_clients' AND column_name IN ('deleted_at', 'portal_token'))
   OR (table_name = 'org_dossiers' AND column_name = 'assigned_comptable_id')
ORDER BY table_name, column_name;
