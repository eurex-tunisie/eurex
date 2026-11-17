import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('tag comptable : notification inseree dans org_notifications', () => {
  assert.ok(SRC.includes("INSERT INTO org_notifications (id, user_id, dossier_id, message)"), 'insert notification');
  assert.ok(SRC.includes('vous a tagué sur'), 'message de tag');
  // la notification vise le comptable tague (targetId), pas celui qui tague
  assert.ok(SRC.includes('.bind(genId(), targetId, dossierId, notifMsg)'), 'notification adressee a targetId');
});

test('tag comptable : le dossier fourni a la notification a exercice + client', () => {
  assert.ok(SRC.includes('d.exercice, c.name as client_name'), 'select exercice/client pour le message');
});

test('tag comptable : endpoint tags recus (48h)', () => {
  assert.ok(SRC.includes("path === '/api/org/me/tags/recent' && method === 'GET'"), 'endpoint tags recents');
  assert.ok(SRC.includes("tc.created_at >= datetime('now', '-' || ? || ' days')"), 'fenetre parametrable (toast 2j / carte 30j)');
  assert.ok(SRC.includes('AS tagged_by_name'), 'nom de celui qui a tague');
  assert.ok(SRC.includes('t.status AS task_status'), 'statut de la tache pour la carte');
  assert.ok(SRC.includes('AND t.hidden = 0'), 'taches masquees exclues');
});

test('tag comptable : /org/me/tasks renvoie is_tagged + tagged_by_name', () => {
  assert.ok(SRC.includes('is_tagged: tagByTask.has(t.id)'), 'is_tagged');
  assert.ok(SRC.includes('tagged_by_name: tagByTask.get(t.id) ?? null'), 'tagged_by_name');
});

test('tag comptable : filtre mine=1 inclut les taches ou je suis tague', () => {
  assert.ok(SRC.includes('OR EXISTS (SELECT 1 FROM org_task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = ?)'), 'mine inclut collaboration');
});

test('tag comptable : /org/me/tasks/recent renvoie aussi is_tagged', () => {
  const recentBlock = SRC.slice(SRC.indexOf("path === '/api/org/me/tasks/recent'"), SRC.indexOf("path === '/api/org/me/tags/recent'"));
  assert.ok(recentBlock.includes('is_tagged: tagByTask.has(t.id)'), 'recent is_tagged');
  assert.ok(recentBlock.includes('tagged_by_name'), 'recent tagged_by_name');
});

test('tag comptable : GET dossier expose added_by_name sur les collaborateurs', () => {
  assert.ok(SRC.includes('cb.full_name AS added_by_name'), 'added_by_name dans la liste des collaborateurs');
});
