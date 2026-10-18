// Regle du cabinet sur le perimetre des avancements : un avancement ne compte
// que les mois DEJA ECOULES (en fevrier -> janvier seul ; en mars -> janvier +
// fevrier ; etc.), et les taches annuelles (month null) ne comptent qu'en
// decembre. La regle est volontairement isolee dans monthInScope() et prend le
// mois et l'annee en parametres : le test est donc independant de la date du
// jour. Sans ce test, une regression remettrait les mois non commences dans le
// denominateur (tous les avancements s'effondrent) ou exclurait a jamais un
// exercice cloture (tout reste a 0 % a partir du 1er janvier suivant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthInScope } from '../src/index.ts';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
// Annee de reference (exercice courant) : le mois passe en 3e argument.
const Y = 2026;

test('fevrier : janvier seul compte, fevrier est exclu', () => {
  assert.equal(monthInScope(1, Y, 2, Y), true);
  assert.equal(monthInScope(2, Y, 2, Y), false);
  assert.equal(monthInScope(3, Y, 2, Y), false);
  assert.equal(monthInScope(12, Y, 2, Y), false);
});

test('mars : janvier + fevrier, mars exclu', () => {
  assert.equal(monthInScope(1, Y, 3, Y), true);
  assert.equal(monthInScope(2, Y, 3, Y), true);
  assert.equal(monthInScope(3, Y, 3, Y), false);
});

test('octobre : janvier a septembre comptes, octobre a decembre exclus', () => {
  for (let m = 1; m <= 9; m++) assert.equal(monthInScope(m, Y, 10, Y), true, 'mois ' + m);
  for (let m = 10; m <= 12; m++) assert.equal(monthInScope(m, Y, 10, Y), false, 'mois ' + m);
});

test('janvier : aucun mois mensuel ne compte encore', () => {
  for (let m = 1; m <= 12; m++) assert.equal(monthInScope(m, Y, 1, Y), false, 'mois ' + m);
});

test('decembre : les 11 premiers mois comptent, decembre non', () => {
  for (let m = 1; m <= 11; m++) assert.equal(monthInScope(m, Y, 12, Y), true, 'mois ' + m);
  assert.equal(monthInScope(12, Y, 12, Y), false);
});

test('taches annuelles (month null) : jamais comptees, sauf en decembre', () => {
  for (const cm of [1, 2, 6, 10, 11]) {
    assert.equal(monthInScope(null, Y, cm, Y), false, 'annuel en mois ' + cm);
    assert.equal(monthInScope(undefined, Y, cm, Y), false, 'annuel (undefined) en mois ' + cm);
  }
  assert.equal(monthInScope(null, Y, 12, Y), true);
});

test('exercice dont l annee est passee : tout compte (y compris annuel)', () => {
  for (let m = 1; m <= 12; m++) assert.equal(monthInScope(m, Y, 1, Y + 1), true, 'mois ' + m);
  assert.equal(monthInScope(null, Y, 1, Y + 1), true);
  assert.equal(monthInScope(null, Y, 10, Y + 1), true);
});

test('exercice courant : la regle des mois s applique (pas de passe-droit)', () => {
  assert.equal(monthInScope(11, Y, 10, Y), false);
  assert.equal(monthInScope(9, Y, 10, Y), true);
});

test('exercice absent ou non numerique : la regle des mois s applique', () => {
  assert.equal(monthInScope(9, null, 10, Y), true);
  assert.equal(monthInScope(11, null, 10, Y), false);
  assert.equal(monthInScope(9, 'abc', 10, Y), true);
  assert.equal(monthInScope(11, 'abc', 10, Y), false);
});

test('mois non numerique : exclu plutot que compte', () => {
  assert.equal(monthInScope('abc', Y, 10, Y), false);
  assert.equal(monthInScope('9', Y, 10, Y), true);
});

test('index.ts : tout appel a inDashboardScope passe l exercice du dossier', () => {
  const bad: string[] = [];
  for (const m of SRC.matchAll(/inDashboardScope\(([^)]*)\)/g)) {
    if (!m[1].includes(',')) bad.push(m[1].trim());
  }
  assert.deepEqual(bad, [], 'appels sans exercice : ' + bad.join(' | '));
});

test('index.ts : le cache d avancement applique la regle des mois ecoules', () => {
  assert.match(SRC, /orgRecalcProgress[\s\S]{0,1500}monthInScope\(t\.month/);
});
