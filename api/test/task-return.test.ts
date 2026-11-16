import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Retour en correction (POST /api/org/dossiers/:d/tasks/:t/return) :
//  - expert/manager : n'importe quelle tache
//  - comptable PROPRIETAIRE (assigne a lui OU qu'il a lui-meme rendu)
//  - action d'audit dynamique : task_returned (superviseur) vs task_returned_self
//    (le KPI qualite ne compte que task_returned -> pas d'auto-penalisation)
//  - notification envoyee UNIQUEMENT par un superviseur

function endpointBlock(): string {
  const idx = SRC.indexOf("path.match(/^\\/api\\/org\\/dossiers\\/([^/]+)\\/tasks\\/([^/]+)\\/return$/)");
  assert.ok(idx > 0, 'endpoint return trouvé');
  const end = SRC.indexOf('// --- ORG:', idx + 10);
  return SRC.slice(idx, end > 0 ? end : idx + 4000);
}

test('endpoint POST return present', () => {
  assert.match(SRC, /orgTaskReturnMatch = path\.match\(\/\^\\\/api\\\/org\\\/dossiers\\\/\(\[\^\/\]\+\)\\\/tasks\\\/\(\[\^\/\]\+\)\\\/return\$\/\)/);
  assert.match(SRC, /orgTaskReturnMatch && method === 'POST'/);
});

test('acces dossier requis (orgCanAccessDossier) puis lecture de la tache', () => {
  const block = endpointBlock();
  assert.match(block, /const user = await verifyOrgToken\(request\)/);
  assert.match(block, /if \(!user\) return json\(\{ error: 'Non autorisé' \}, 401\)/);
  assert.match(block, /if \(!await orgCanAccessDossier\(user, orgTaskReturnMatch\[1\]\)\) return json\(\{ error: 'Accès refusé' \}, 403\)/);
  assert.match(block, /SELECT \* FROM org_tasks WHERE id = \? AND dossier_id = \?/);
  assert.match(block, /if \(!task\) return json\(\{ error: 'Tâche non trouvée' \}, 404\)/);
});

test('permission : superviseur OU proprietaire (assigne ou done_by)', () => {
  const block = endpointBlock();
  assert.match(block, /const isSup = isSupervisor\(user\.role\)/);
  assert.match(block, /const isOwner = task\.assigned_comptable_id === user\.id \|\| task\.done_by === user\.id/);
  assert.match(block, /if \(!isSup && !isOwner\) return json\(\{ error: 'Réservé au rôle expert\/manager ou au comptable assigné' \}, 403\)/);
});

test('tache doit etre en verification + motif >= 3 caracteres', () => {
  const block = endpointBlock();
  assert.match(block, /if \(task\.status !== 'a_verifier'\) return json\(\{ error: 'Seule une tâche en vérification peut être renvoyée en correction' \}, 400\)/);
  assert.match(block, /if \(reasonTxt\.length < 3\) return json\(\{ error: 'Motif requis \(3 caractères minimum\)' \}, 400\)/);
});

test('retour : a_verifier -> en_cours, verify_due_at efface, progress recalcule', () => {
  const block = endpointBlock();
  assert.match(block, /UPDATE org_tasks SET status = 'en_cours', verify_due_at = NULL, updated_by = \?, updated_at = datetime\('now'\) WHERE id = \?/);
  assert.match(block, /const progress = await orgRecalcProgress\(env\.DB, orgTaskReturnMatch\[1\]\)/);
});

test('action d\'audit dynamique : task_returned vs task_returned_self', () => {
  const block = endpointBlock();
  assert.match(block, /const action = isSup \? 'task_returned' : 'task_returned_self'/);
  // la 5e valeur du INSERT est liee (pas de literal) + details.by
  assert.match(block, /org_audit_log \(id, organization_id, user_id, user_name, action, target_type, target_id, details\) VALUES \(\?, \?, \?, \?, \?, \\'task\\', \?, \?\)/);
  assert.match(block, /user\.full_name, action, task\.id, JSON\.stringify\(\{[^}]*by: isSup \? 'expert' : 'comptable' \}\)/);
});

test('notification uniquement pour un superviseur (pas d\'auto-retour)', () => {
  const block = endpointBlock();
  const idxNotif = block.indexOf('org_notifications');
  assert.ok(idxNotif > 0, 'notification presente');
  const before = block.slice(0, idxNotif);
  assert.match(before, /if \(isSup\) \{\s*const targetId = task\.done_by \|\| task\.assigned_comptable_id;/);
  // la porte isSup englobe l'INSERT : elle s'ouvre avant et le retour se fait
  // APRES l'INSERT (aucun return entre les deux)
  const gateOpen = before.lastIndexOf('if (isSup) {');
  assert.ok(gateOpen > 0, 'porte if (isSup) presente avant la notification');
  const between = block.slice(gateOpen, idxNotif);
  assert.ok(!/return json\(/.test(between), 'aucun return entre la porte et l\'INSERT');
  // ... et la fonction sort ensuite (le bloc n'est pas suivi d un else)
  const afterInsert = block.indexOf('return json({ ok: true, progress });', idxNotif);
  assert.ok(afterInsert > idxNotif, 'le retour sort apres la notification');
});

test('KPI qualite : task_returned_self hors des compteurs', () => {
  // les deux requetes KPI ne filtrent que task_verified + task_returned
  const occurrences = SRC.split("IN ('task_verified','task_returned')").length - 1;
  assert.equal(occurrences, 2, 'deux compteurs KPI (qualite + par comptable)');
  assert.ok(!SRC.includes("IN ('task_verified','task_returned','task_returned_self')"), 'pas de task_returned_self dans les KPI');
});
