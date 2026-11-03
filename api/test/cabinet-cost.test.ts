import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const D1 = readFileSync(new URL('../migrations/0043_cabinet_time_costs.sql', import.meta.url), 'utf8');
const PG = readFileSync(new URL('../supabase/migration-0043-cabinet-time-costs.sql', import.meta.url), 'utf8');
const BILLING = readFileSync(new URL('../migrations/0046_dossier_billing.sql', import.meta.url), 'utf8');
const BILLING_PG = readFileSync(new URL('../supabase/migration-0046-dossier-billing.sql', import.meta.url), 'utf8');
const TIME_PARTS = readFileSync(new URL('../migrations/0045_cabinet_time_parts.sql', import.meta.url), 'utf8');
const TIME_PARTS_PG = readFileSync(new URL('../supabase/migration-0045-cabinet-time-parts.sql', import.meta.url), 'utf8');

test('migration adds nullable rate and task norms on D1 and PostgreSQL', () => {
  for (const [name, sql] of [['D1', D1], ['PostgreSQL', PG]] as const) {
    assert.match(sql, /org_users\s+ADD COLUMN[^;]*hourly_cost_cents/i, `${name}: hourly rate`);
    assert.match(sql, /org_task_templates\s+ADD COLUMN[^;]*norm_seconds/i, `${name}: template norm`);
    assert.match(sql, /org_tasks\s+ADD COLUMN[^;]*norm_seconds/i, `${name}: task norm`);
  }
});

test('time split migration has a unique sequence after hourly-cost migration in both databases', () => {
  assert.match(TIME_PARTS, /org_task_templates ADD COLUMN part/);
  assert.match(TIME_PARTS, /org_tasks ADD COLUMN part/);
  assert.match(TIME_PARTS_PG, /org_task_templates ADD COLUMN IF NOT EXISTS part/);
  assert.match(TIME_PARTS_PG, /org_tasks ADD COLUMN IF NOT EXISTS part/);
  assert.match(BILLING, /org_dossier_billing/);
  assert.match(BILLING, /org_time_entries ADD COLUMN part/);
  assert.match(BILLING_PG, /org_time_entries ADD COLUMN IF NOT EXISTS part/);
});

test('timer and manual time persist the selected part, dossier reports entry part', () => {
  assert.match(SRC, /INSERT INTO org_time_entries \(id, dossier_id, task_id, user_id, started_at, part\)/);
  assert.match(SRC, /duration_seconds, note, part\) VALUES/);
  assert.match(SRC, /COALESCE\(te\.part, t\.part, 'comptable'\) as task_part/);
  assert.match(SRC, /COALESCE\(te\.part, t\.part, 'comptable'\) AS task_part/);
  const page = readFileSync(new URL('../../web/src/pages/org/OrgDossierPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /data-testid="timer-part"/);
  assert.match(page, /data-testid="manual-time-part"/);
  assert.match(page, /timerPartByTask\[task\.id\] \|\| task\.part \|\| 'comptable'/);
  assert.match(page, /manualTimePartByTask\[taskId\] \|\| dossier\.tasks\.find\(t => t\.id === taskId\)\?\.part \|\| 'comptable'/);
  assert.match(SRC, /body\.part \?\? task\.part \?\? 'comptable'/);
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
  assert.match(SRC, /created_at, norm_seconds, part\) VALUES/);
  assert.match(SRC, /SELECT t\.id, t\.dossier_id, t\.label, t\.status, t\.export_scope, t\.month, t\.norm_seconds/);
  assert.match(SRC, /customNormsByDossier\.get\(d\.id\)\?\.get\(t\.label\) \?\? t\.norm_seconds/);
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
  assert.match(page, /orgApi\.getAllDossiers/);
  assert.match(page, /data-testid="cabinet-hours-dashboard"/);
  assert.match(page, /data-testid="hours-dossier-row"/);
  assert.match(page, /data-testid="hours-person-detail"/);
  assert.match(page, /time_by_person/);
});

test('dossier billing is separate from labor cost and persisted per selected dossier', () => {
  assert.match(BILLING, /org_dossier_billing/);
  assert.match(BILLING_PG, /org_dossier_billing/);
  assert.match(SRC, /dossier_billing_updated/);
  assert.match(SRC, /quoted_cents/);
  assert.match(SRC, /collected_cents/);
  const settings = readFileSync(new URL('../../web/src/pages/org/OrgSettings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /selectedBillingDossierIds/);
  assert.match(settings, /upsertDossierBilling/);
  assert.match(settings, /applyBillingToSelected/);
  assert.match(settings, /data-testid="direct-client-billing"/);
  assert.match(settings, /applyBillingToSelected/);
});

test('switching a task template to Entreprise assigns a company and keeps it selectable', () => {
  const settings = readFileSync(new URL('../../web/src/pages/org/OrgSettings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /pendingTemplateEdits/);
  assert.match(settings, /const saveTemplatePart = async/);
  assert.match(settings, /part, client_id: part === 'entreprise' \? edit\.client_id : null/);
  assert.match(settings, /Choisir l’entreprise…/);
  assert.match(settings, /save-template-part-\$\{tmpl\.id\}/);
  assert.match(settings, /Enregistrer/);
  assert.match(settings, /Modèle enregistré avec succès\./);
});
