// Module Cabinet « e7tifel » : a la fin d une tache, le temps passe est compare
// a la norme — dans les temps : video de celebration ; apres la norme : boite
// « motif du retard », stockee dans une colonne DEDIEE late_reason.
// Jamais dans blocked_reason, qui signifie blocage client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const D1 = readFileSync(new URL('../migrations/0048_task_late_reason.sql', import.meta.url), 'utf8');
const PG = readFileSync(new URL('../supabase/migration-0048-task-late-reason.sql', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('0048 (D1) : ALTER TABLE org_tasks ADD COLUMN late_reason en syntaxe SQLite', () => {
  assert.match(D1, /ALTER\s+TABLE\s+org_tasks\s+ADD\s+COLUMN\s+late_reason\s+TEXT/i);
  // SQLite n accepte pas IF NOT EXISTS sur ADD COLUMN : c est le miroir PG qui
  // porte l idempotence.
  assert.ok(!/IF NOT EXISTS/i.test(D1), 'migration D1 sans IF NOT EXISTS');
});

test('0048 (miroir PG) : colonne idempotente et sans dialecte SQLite', () => {
  assert.match(PG, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+late_reason\s+TEXT/i);
  assert.ok(!/datetime\s*\(|strftime\s*\(/i.test(PG), 'aucune fonction SQLite dans le miroir');
});

test('schema.sql (photographie) : late_reason dans la table org_tasks', () => {
  const table = SCHEMA.slice(SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS org_tasks'));
  const body = table.slice(0, table.indexOf(');'));
  assert.match(body, /\blate_reason\b/);
});

test('PATCH /org/dossiers/:id/tasks/:id accepte late_reason', () => {
  assert.match(SRC, /const \{[^}]*\blate_reason\b[^}]*\} = body;/);
  assert.match(SRC, /updates\.push\('late_reason = \?'\)/);
  // distinct de blocked_reason : le motif de retard ne reutilise PAS le blocage
  assert.match(SRC, /if \(late_reason !== undefined\)/);
  assert.ok(!/blocked_reason = \?[^;]*late_reason/.test(SRC), 'late_reason ne passe jamais par blocked_reason');
});

test('audit task_status_changed journalise late_reason', () => {
  assert.match(SRC, /old_status: oldStatus, new_status: effStatus, blocked_reason, late_reason/);
});
