import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Temps d'un comptable "tague" (org_task_collaborators) hors de la norme :
//  - helper isTaskCollab
//  - 4 sites d'ecriture de org_tasks.total_time_seconds gardes
//  - org_time_entries toujours inscrit (heures perso / cout / export inchanges)
//  - cumul d'age (over_since_days) ignore aussi les pointages des tagues

function helperBlock(): string {
  const idx = SRC.indexOf('async function isTaskCollab');
  assert.ok(idx > 0, 'helper isTaskCollab trouvé');
  return SRC.slice(idx, idx + 400);
}

test('helper isTaskCollab : presence + lecture org_task_collaborators', () => {
  const block = helperBlock();
  assert.match(block, /async function isTaskCollab\(taskId: string, userId: string\): Promise<boolean>/);
  assert.match(block, /SELECT 1 AS x FROM org_task_collaborators WHERE task_id = \? AND user_id = \?/);
  assert.match(block, /return !!r/);
});

// --- Les 4 sites d'ecriture du total ---

function blockAround(anchor: string, span = 1200): string {
  const idx = SRC.indexOf(anchor);
  assert.ok(idx > 0, 'anchor trouvé: ' + anchor.slice(0, 50));
  return SRC.slice(Math.max(0, idx - span), idx + span);
}

test('site 1 : retrait de tag — le chrono du degage n\'alimente pas le total', () => {
  // boucle d'arret des chronos du compte desagrege (grant Collaboration retire)
  const block = blockAround('const taggedTime = rt.task_id === taskId || await isTaskCollab(rt.task_id, targetId);');
  assert.match(block, /UPDATE org_time_entries SET stopped_at = datetime\('now'\), duration_seconds = \? WHERE id = \?/);
  assert.match(block, /if \(!taggedTime\) \{[\s\S]*?UPDATE org_tasks SET total_time_seconds = COALESCE\(total_time_seconds, 0\) \+ \? WHERE id = \?/);
});

test('site 2 : auto-stop au demarrage — garde isTaskCollab(at.task_id, user.id)', () => {
  const block = blockAround('if (!await isTaskCollab(at.task_id, user.id)) {');
  assert.match(block, /for \(const at of activeTimers as any\[\]\) \{/);
  assert.match(block, /if \(!await isTaskCollab\(at\.task_id, user\.id\)\) \{[\s\S]*?UPDATE org_tasks SET total_time_seconds = COALESCE\(total_time_seconds, 0\) \+ \? WHERE id = \?/);
  // le pointage de CE chrono reste enregistre
  assert.match(block, /UPDATE org_time_entries SET stopped_at = datetime\('now'\), duration_seconds = \? WHERE id = \?/);
});

test('site 3 : stop chrono — newTotal neutre si tague', () => {
  const block = blockAround('const collabStop = await isTaskCollab(taskId, user.id);');
  assert.match(block, /const newTotal = \(task\.total_time_seconds \|\| 0\) \+ \(collabStop \? 0 : elapsed\)/);
  // les deux branches d'ecriture (remaining ou pas) passent par newTotal
  assert.match(block, /UPDATE org_tasks SET total_time_seconds = \?, timer_started_at = \?, timer_user_id = \? WHERE id = \?/);
  assert.match(block, /UPDATE org_tasks SET total_time_seconds = \?, timer_started_at = NULL, timer_user_id = NULL WHERE id = \?/);
});

test('site 4 : saisie manuelle — newTotal neutre si tague, pointage conserve', () => {
  const block = blockAround('const collabManual = await isTaskCollab(taskId, user.id);');
  assert.match(block, /const newTotal = \(task\.total_time_seconds \|\| 0\) \+ \(collabManual \? 0 : secs\)/);
  // la saisie reste inscrite dans org_time_entries (heures du comptable)
  assert.match(block, /INSERT INTO org_time_entries \(id, dossier_id, task_id, user_id, started_at, stopped_at, duration_seconds, note, part\)/);
  // ... et le total ecrit via newTotal (donc neutre pour un tague)
  assert.match(block, /UPDATE org_tasks SET total_time_seconds = \?, updated_by = \?, updated_at = datetime\('now'\) WHERE id = \?/);
});

test('aucun autre site d\'ecriture du total sans garde', () => {
  // toutes les ecritures SQL du total sont dans les 4 zones ci-dessus
  const matches = SRC.match(/UPDATE org_tasks SET total_time_seconds[^\n]*/g) || [];
  assert.equal(matches.length, 5, 'exactement 5 UPDATE (sites 1, 2, 3 x2 branches, 4)');
  // les 2 sites incrementaux (+?) sont enveloppes d'une garde collab
  const guards = SRC.match(/isTaskCollab\(/g) || [];
  assert.ok(guards.length >= 5, 'helper appele au moins 4 fois + declaration');
});

test('cumul d\'age (over_since_days) : pointages des tagues exclus', () => {
  const idx = SRC.indexOf('FROM org_time_entries te WHERE te.task_id IN (${chunk');
  assert.ok(idx > 0, 'requete de cumul trouvee');
  const line = SRC.slice(idx, idx + 300);
  assert.match(line, /AND NOT EXISTS \(SELECT 1 FROM org_task_collaborators tc WHERE tc\.task_id = te\.task_id AND tc\.user_id = te\.user_id\)/);
});
