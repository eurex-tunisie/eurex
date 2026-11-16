import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Dossier d'exercice ancien (exercice < annee courante) -> UNE tache unique
// « Suivi exercice ancien » : receptacle de pointage du comptable, hors
// check-list, hors documents attendus et HORS avancement (progress = null,
// exclu des KPI et des moyennes). Marqueur par libelle : ni migration, ni
// colonne, stable au passage d'annee (pas de bascule en 2027).

function count(needle: string): number {
  return SRC.split(needle).length - 1;
}

test('marqueur : libelle fige + detection par annee (tnYear)', () => {
  assert.ok(SRC.includes("export const ANCIENT_TASK_LABEL = 'Suivi exercice ancien';"));
  assert.ok(SRC.includes('export function isAncientExercice(ex: any): boolean { return Number(ex) < tnYear(); }'));
  // marqueur SQL des endpoints (compatible D1/SQLite et miroir PG, ASCII)
  assert.ok(SRC.includes('function ancientSql(alias: string): string {'));
  assert.ok(count("ancientSql('d')") >= 6, 'ancientSql utilise par portail, rapport, presence, detail, dossiers, recherche');
});

test('porte 1 : creation du dossier — une seule tache si ancien', () => {
  assert.ok(SRC.includes('const ancient = isAncientExercice(exercice);'));
  assert.ok(SRC.includes('.bind(genId(), dossierId, ANCIENT_TASK_LABEL, compId).run();'));
  // la check-list de modeles est entierement sautee
  assert.ok(SRC.includes('for (const tmpl of ancient ? [] : templates as any[]) {'));
});

test('porte 2 : import Excel — idem, une seule tache', () => {
  assert.ok(SRC.includes('if (isAncientExercice(exYear)) {'));
  assert.ok(SRC.includes('.bind(genId(), dossierId, ANCIENT_TASK_LABEL, compId));'));
  assert.ok(SRC.includes('for (const tmpl of isAncientExercice(exYear) ? [] : templates as any[]) {'));
});

test('porte 3 : duplication — 1 tache, ni copie des taches ni des documents', () => {
  assert.ok(SRC.includes('const ancientDup = isAncientExercice(targetYear);'));
  assert.ok(SRC.includes('.bind(genId(), newDossierId, ANCIENT_TASK_LABEL, src.assigned_comptable_id || null).run();'));
  assert.ok(SRC.includes('for (const t of (ancientDup ? [] : srcTasks) as any[]) {'));
  assert.ok(SRC.includes('for (const doc of (ancientDup ? [] : srcDocs) as any[]) {'));
  // retour : 1 tache, 0 document
  assert.ok(SRC.includes('tasks: ancientDup ? 1 : srcTasks.length, docs: ancientDup ? 0 : (srcDocs as any[]).length'));
});

test('les 3 portes insertent la MEME tache unique (mois NULL, hors export, comptable)', () => {
  const shape = "VALUES (?, ?, ?, 'a_faire', 0, 0, ?, NULL, NULL, 0, datetime('now'), 'comptable')";
  assert.equal(count(shape), 3, 'creation + import + duplication');
});

test('avancement : le calcul ignore la tache ancienne', () => {
  // cache recalcule (orgRecalcProgress) : le libelle est exclu de la requete
  assert.ok(SRC.includes(`t.hidden = 0 AND t.label != '" + ANCIENT_TASK_LABEL + "'"`));
  // boucles de stats des endpoints : le saut est fait APRES le comptage de la
  // file de validation (une tache rendue doit etre validee, meme ancienne)
  assert.ok(count('if (t.label === ANCIENT_TASK_LABEL) continue;') >= 4);
  const queueIdx = SRC.indexOf("verifyCounts.validated++; else if (t.status === 'a_verifier') verifyCounts.pending++;");
  const skipIdx = SRC.indexOf('if (t.label === ANCIENT_TASK_LABEL) continue;');
  assert.ok(queueIdx > 0 && skipIdx > queueIdx, 'la file de validation garde la tache ancienne');
  // liste des dossiers du client : variante avec marqueur
  assert.ok(SRC.includes('if (t.label === ANCIENT_TASK_LABEL) { isAncient = true; continue; }'));
  // rapport mensuel : agregats SQL excludes des le GROUP BY
  assert.ok(SRC.includes("AND t.hidden = 0 AND t.label != '${ANCIENT_TASK_LABEL}'"));
});

test('progress null partout : clients, dossiers, dossier, portail, rapport, comptables', () => {
  assert.ok(SRC.includes('progress: isAnc ? null : (taskStats.total > 0')); // A : clients enrichis
  assert.ok(SRC.includes('progress: isAncient ? null : (s.total > 0')); // B : liste dossiers client
  assert.ok(SRC.includes('const isAncientDossier = tasks.some(t => t.label === ANCIENT_TASK_LABEL);')); // C
  assert.ok(SRC.includes('progress: isAncientDossier ? null : (stats.total > 0'));
  assert.ok(SRC.includes('progress: dossier.is_ancient ? null : (dossier.cached_progress || 0)')); // D : portail
  assert.ok(SRC.includes('progress: d.is_ancient ? null : (tt ? Math.round(td / tt * 1000) / 10 : 0)')); // E : rapport
  assert.ok(count('progress: d.is_ancient ? null : (s.total > 0') >= 2); // G : detail comptable + H : liste dossiers
});

test('KPI : les moyennes excluent les dossiers ancien (numerateur ET denominateur)', () => {
  assert.ok(SRC.includes('const progRows = clients.filter((cl: any) => !cl.is_ancient);')); // F : presence
  assert.ok(SRC.includes('avg_progress: progRows.length > 0 ? Math.round(progRows.reduce'));
  assert.ok(SRC.includes('const progDossiers = enrichedDossiers.filter(d => d.progress !== null);')); // G : detail
  assert.ok(SRC.includes('avgProgress = progDossiers.length > 0 ? Math.round(progDossiers.reduce'));
});

test('audit : ancien:true sur creation et duplication (actions historiques)', () => {
  assert.ok(SRC.includes('...(ancient ? { ancien: true } : {})'));
  assert.ok(SRC.includes('...(ancientDup ? { ancien: true } : {})'));
  // les actions restent dossier_created / dossier_duplicated (historique lisible)
  assert.ok(SRC.includes("'dossier_created'") || SRC.includes("\\'dossier_created\\'"));
  assert.ok(SRC.includes('dossier_duplicated'));
});
