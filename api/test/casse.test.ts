import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casseLinesForFacture } from '../src/index.ts';

// VT J.C -> Debit 541100 CAISSE J.C, VT C -> Debit 541000 CAISSE J.M.
// Credit 411004 CLIENTS PASSAGERS ESPECES, montant = ESPÈCES du rapport du jour
// (pas le TTC). Jour sans rapport (especes null/0) -> aucune pièce.

test('casse : montant = especes du rapport, VT J.C debite 541100 CAISSE J.C', () => {
  const c = casseLinesForFacture({ numero_facture: '2026/1', date_facture: '2026-01-02', total_ttc: 2257.1, journal: 'VT J.C' }, 1283.55)!;
  assert.ok(c);
  assert.equal(c.numPiece, 'FAC N°1');
  assert.equal(c.libelle, 'FAC N°1-26 CLT PASSAGERS');
  assert.equal(c.montant, 1283.55); // espèces du rapport, pas le TTC 2257.1
  assert.deepEqual(c.lines, [
    { compte: '541100', sens: 'D' },
    { compte: '411004', sens: 'C' },
  ]);
});

test('casse : VT C debite 541000 CAISSE J.M', () => {
  const c = casseLinesForFacture({ numero_facture: '2026/21', date_facture: '2026-01-09', total_ttc: 1530.92, journal: 'VT C' }, 505.74)!;
  assert.equal(c.numPiece, 'FAC N°21');
  assert.equal(c.lines[0].compte, '541000');
  assert.equal(c.lines[1].compte, '411004');
  assert.equal(c.montant, 505.74);
});

test('casse : journal absent = VT J.C par defaut', () => {
  const c = casseLinesForFacture({ numero_facture: '2026/7', date_facture: '2026-01-04', total_ttc: 100 }, 555.46)!;
  assert.equal(c.lines[0].compte, '541100');
  assert.equal(c.montant, 555.46);
});

test('casse : jour sans rapport (especes null/0/absent) -> aucune piece', () => {
  assert.equal(casseLinesForFacture({ numero_facture: '2026/1', date_facture: '2026-01-05', total_ttc: 100 }, null), null);
  assert.equal(casseLinesForFacture({ numero_facture: '2026/1', date_facture: '2026-01-05', total_ttc: 100 }, 0), null);
  assert.equal(casseLinesForFacture({ numero_facture: '2026/1', date_facture: '2026-01-05', total_ttc: 100 }, undefined), null);
  // Même avec un TTC non nul : pas de pièce sans espèces.
  assert.equal(casseLinesForFacture({ numero_facture: '2026/1', total_ttc: 999 }, null), null);
});

test('casse : montant arrondi a 3 decimales', () => {
  const c = casseLinesForFacture({ numero_facture: '2026/20', date_facture: '2026-01-10', total_ttc: 3126.1115, journal: 'VT J.C' }, 780.0715)!;
  assert.equal(c.montant, 780.072);
  assert.equal(c.numPiece, 'FAC N°20');
});
