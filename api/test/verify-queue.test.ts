// File de validation cote API : « combien de tâches sont faites mais pas encore
// validees » (statut a_verifier) et « quelle part est deja validee ». Ces deux
// nombres alimentent la carte comptable du dashboard expert, la carte « En
// attente de validation » du dashboard comptable, et le taux affiche.
//
// Deux pieges sont verrouilles ici :
//  1. les compteurs doivent etre comptes AVANT les filtres « perimetre d'export »
//     et « mois ecoules » : une tâche rendue en octobre doit apparaitre dans la
//     file de validation, comme elle apparait deja dans /api/org/tasks/verify
//     (sinon le taux affiche ne parle pas du meme ensemble que la file) ;
//  2. le chrono en cours doit ramener aussi le libelle de la tâche, sinon la carte
//     ne peut pas dire « ce qu'elle fait maintenant » sans ouvrir sa fiche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const LINES = SRC.split('\n');

const idx = (needle: string, from = 0) => {
  const i = LINES.findIndex((l, n) => n >= from && l.includes(needle));
  assert.notEqual(i, -1, `introuvable apres la ligne ${from} : ${needle}`);
  return i;
};

test('/api/org/comptables : expose verify_counts et le chrono en cours', () => {
  assert.ok(SRC.includes('verify_counts: vc'),
    'la carte comptable a besoin des compteurs valide / en attente');
  assert.ok(SRC.includes('active_timer: runRow ? { task_label: runRow.task_label'),
    'la carte doit pouvoir afficher ce qu elle fait maintenant');
  assert.ok(SRC.includes('const runStart = parseUtc(runRow?.started_at);'),
    'les heures du jour doivent utiliser la ligne du chrono (libelle + debut)');
});

test('/api/org/clients : expose verify_counts par client (dashboard comptable)', () => {
  assert.ok(SRC.includes('verify_counts: verifyCounts'),
    'le dashboard comptable derive son compteur des clients deja charges');
});

test('les compteurs de validation ignorent le mois et le perimetre d export', () => {
  for (const decl of ['const vc = { validated: 0, pending: 0 };', 'const verifyCounts = { validated: 0, pending: 0 };']) {
    const start = idx(decl);
    const inc = idx('validated++;', start);
    const exportGuard = idx('if (!exportScopeKeeps(t.export_scope', start);
    const monthGuard = idx('if (!inDashboardScope(t.month', start);
    assert.ok(inc < exportGuard, `${decl} : le compteur doit etre incremente avant le filtre export`);
    assert.ok(inc < monthGuard, `${decl} : le compteur doit etre incremente avant le filtre mois`);
  }
});

test('le chrono en cours vient d une seule requete pour tout le cabinet', () => {
  assert.ok(SRC.includes('SELECT te.user_id, te.started_at, t.label AS task_label, t.dossier_id AS dossier_id FROM org_time_entries te LEFT JOIN org_tasks t ON t.id = te.task_id WHERE te.stopped_at IS NULL'),
    'le libelle de la tâche doit venir de la meme requete que le chrono');
  assert.ok(!SRC.includes('new Map((running as any[]).map(r => [r.user_id, r.started_at]))'),
    'runByUser doit porter la ligne (debut + libelle), pas le seul started_at');
});

test('la file de validation reste celle de /api/org/tasks/verify (a_verifier, non masquees)', () => {
  assert.ok(SRC.includes("AND t.status = 'a_verifier' AND t.hidden = 0"),
    'la file de l expert doit rester basee sur a_verifier');
  const upd = SRC.match(/status = 'a_verifier'/g) || [];
  assert.ok(upd.length >= 1, 'le passage en a_verifier doit rester en place');
});
