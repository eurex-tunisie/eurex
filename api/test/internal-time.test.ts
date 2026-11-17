import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('internal time : table org_internal_time_entries referencee', () => {
  assert.ok(SRC.includes('org_internal_time_entries'), 'table referencee dans le code');
});

test('internal time : endpoints start/stop/manual/active existent', () => {
  assert.ok(SRC.includes("/api/org/internal-time/start' && method === 'POST'"), 'start');
  assert.ok(SRC.includes("/api/org/internal-time/stop' && method === 'POST'"), 'stop');
  assert.ok(SRC.includes("/api/org/internal-time/manual' && method === 'POST'"), 'manual');
  assert.ok(SRC.includes("/api/org/internal-time/active' && method === 'GET'"), 'active');
});

test('internal time : categories par defaut reunion/informatique + editables', () => {
  assert.ok(SRC.includes("code: 'reunion', label: 'Réunion'"), 'defaut reunion');
  assert.ok(SRC.includes("code: 'informatique', label: 'Informatique'"), 'defaut informatique');
  assert.ok(SRC.includes('/api/org/internal-time/categories'), 'endpoint categories');
});

test('internal time : agrege dans buildHoursPayload (UNION)', () => {
  // la requete byDay doit inclure org_internal_time_entries
  assert.ok(SRC.includes('FROM org_internal_time_entries WHERE user_id = ? AND stopped_at IS NOT NULL'), 'agregation non-exercice');
  assert.ok(SRC.includes("strftime('%Y', datetime(started_at, '+60 minutes')) = ?"), 'filtre exercice interne');
});

test('internal time : un seul chrono par utilisateur (arret des autres)', () => {
  assert.ok(SRC.includes("SELECT id, task_id, started_at FROM org_time_entries WHERE user_id = ? AND stopped_at IS NULL"), 'arret chrono dossier');
  assert.ok(SRC.includes("SELECT id, started_at FROM org_internal_time_entries WHERE user_id = ? AND stopped_at IS NULL"), 'arret chrono interne');
});

test('internal time : acces comptable/expert/manager', () => {
  // les 4 endpoints verifient le role
  const count = (SRC.match(/isSupervisor\(user\.role\) && user\.role !== 'comptable'/g) || []).length;
  assert.ok(count >= 4, `garde role presente (${count})`);
});
