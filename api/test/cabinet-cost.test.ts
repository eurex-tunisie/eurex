import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const D1 = readFileSync(new URL('../migrations/0043_cabinet_time_costs.sql', import.meta.url), 'utf8');
const PG = readFileSync(new URL('../supabase/migration-0043-cabinet-time-costs.sql', import.meta.url), 'utf8');

test('migration adds nullable rate and task norms on D1 and PostgreSQL', () => {
  for (const [name, sql] of [['D1', D1], ['PostgreSQL', PG]] as const) {
    assert.match(sql, /org_users\s+ADD COLUMN[^;]*hourly_cost_cents/i, `${name}: hourly rate`);
    assert.match(sql, /org_task_templates\s+ADD COLUMN[^;]*norm_seconds/i, `${name}: template norm`);
    assert.match(sql, /org_tasks\s+ADD COLUMN[^;]*norm_seconds/i, `${name}: task norm`);
  }
});

test('hourly rate is supervisor-managed, range checked and audited; non-supervisors do not receive it', () => {
  assert.match(SRC, /!user \|\| !isSupervisor\(user\.role\).*Réservé au rôle expert/);
  assert.match(SRC, /hourly_cost_cents < 0 \|\| hourly_cost_cents > 100000000/);
  assert.match(SRC, /hourly_cost_updated/);
  assert.match(SRC, /CASE WHEN \? THEN hourly_cost_cents ELSE NULL END AS hourly_cost_cents/);
});

test('norms are validated, configurable and copied from task templates to new tasks', () => {
  assert.match(SRC, /norm_seconds < 60 \|\| norm_seconds > 86400 \* 30/);
  assert.match(SRC, /UPDATE org_task_templates SET \$\{updates\.join\(', '\)\}/);
  assert.match(SRC, /created_at, norm_seconds\) VALUES/);
});

test('verification minute entry stays explicit, is attributed to verifier and persists as time entry', () => {
  assert.match(SRC, /const vSecs = \(\(\) => \{[\s\S]{0,180}return 300;/);
  assert.match(SRC, /INSERT INTO org_time_entries \(id, dossier_id, task_id, user_id, started_at, stopped_at, duration_seconds, note\)/);
  assert.match(SRC, /verify_seconds: vSecs/);
});

test('dossier labor costs sum seconds by user at each confidential hourly rate and omit incomplete total', () => {
  assert.match(SRC, /Math\.round\(rate \* seconds \/ 3600\)/);
  assert.match(SRC, /time_cost_complete/);
  assert.match(SRC, /Réservé au rôle expert\/manager/);
});

test('expert dashboard exposes a separate detailed hours/cost view and asks the API only when opened', () => {
  const page = readFileSync(new URL('../../web/src/pages/org/OrgDashboardExpert.tsx', import.meta.url), 'utf8');
  assert.match(page, /key: 'heures' as Tab, label: 'Heures & coûts'/);
  assert.match(page, /orgApi\.getAllDossiers\(exercice, true\)/);
  assert.match(page, /data-testid="cabinet-hours-dashboard"/);
  assert.match(page, /Détail par tâche\/personne|Ouvrir le détail par tâche\/personne/);
});
