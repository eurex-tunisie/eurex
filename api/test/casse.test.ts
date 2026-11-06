import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cassePieceForDay } from '../src/index.ts';

// Journal CAI : une pièce PAR JOUR (et par journal), montant = ESPÈCES du rapport
// du jour (pas le TTC). Jour sans rapport (especes null/0) → aucune pièce.
// VT J.C -> Debit 541100 CAISSE J.C, VT C -> Debit 541000 CAISSE J.M.
// Credit 411004 CLIENTS PASSAGERS ESPECES.

test('casse : piece par jour, montant = especes, VT J.C debite 541100 CAISSE J.C', () => {
  const c = cassePieceForDay('2026-01-02', [
    { numero_facture: '2026/1', date_facture: '2026-01-02', total_ttc: 2257.1, journal: 'VT J.C' },
  ], 1283.55)!;
  assert.ok(c);
  assert.equal(c.numPiece, 'FAC N°1');
  assert.equal(c.libelle, 'FAC N°1-26 CLT PASSAGERS');
  assert.equal(c.montant, 1283.55);
  assert.deepEqual(c.lines, [
    { compte: '541100', sens: 'D' },
    { compte: '411004', sens: 'C' },
  ]);
});

test('casse : 2 factures le meme jour -> une seule piece, n° combines', () => {
  const c = cassePieceForDay('2026-06-02', [
    { numero_facture: '2026/333', date_facture: '2026-06-02', total_ttc: 100, journal: 'VT J.C' },
    { numero_facture: '2026/334', date_facture: '2026-06-02', total_ttc: 200, journal: 'VT J.C' },
  ], 500)!;
  assert.ok(c);
  assert.equal(c.numPiece, 'FAC N°333,334');
  assert.equal(c.libelle, 'FAC N°333,334-26 CLT PASSAGERS');
  assert.equal(c.montant, 500); // une seule fois les especes, pas 2x
  assert.equal(c.lines[0].compte, '541100');
});

test('casse : VT C debite 541000 CAISSE J.M', () => {
  const c = cassePieceForDay('2026-01-09', [
    { numero_facture: '2026/21', date_facture: '2026-01-09', total_ttc: 1530.92, journal: 'VT C' },
  ], 505.74)!;
  assert.equal(c.numPiece, 'FAC N°21');
  assert.equal(c.lines[0].compte, '541000');
  assert.equal(c.lines[1].compte, '411004');
  assert.equal(c.montant, 505.74);
});

test('casse : jour sans rapport (especes null/0/absent) -> aucune piece', () => {
  const f = [{ numero_facture: '2026/1', date_facture: '2026-01-05', total_ttc: 100, journal: 'VT J.C' }];
  assert.equal(cassePieceForDay('2026-01-05', f, null), null);
  assert.equal(cassePieceForDay('2026-01-05', f, 0), null);
  assert.equal(cassePieceForDay('2026-01-05', f, undefined), null);
  // Même avec un TTC non nul : pas de pièce sans espèces.
  assert.equal(cassePieceForDay('2026-01-05', f, null), null);
});

test('casse : jour sans facture -> aucune piece', () => {
  assert.equal(cassePieceForDay('2026-01-05', [], 500), null);
});

test('casse : montant arrondi a 3 decimales', () => {
  const c = cassePieceForDay('2026-01-10', [
    { numero_facture: '2026/20', date_facture: '2026-01-10', total_ttc: 3126.1115, journal: 'VT J.C' },
  ], 780.0715)!;
  assert.equal(c.montant, 780.072);
  assert.equal(c.numPiece, 'FAC N°20');
});
