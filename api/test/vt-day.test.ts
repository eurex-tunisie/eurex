// Ecritures d'une journee VT (VT J.C / VT C) : la piece generee doit toujours
// etre equilibree, y compris quand le rapport "Vente par jour" contient un
// montant negatif (avoir rendu au client) — cas reel du 17/02/2026 ANIMAL CITY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayEcritures } from '../src/index.ts';

const facture = {
  numero_facture: '2026/91',
  client: '99',
  total_ht_0: 906.492,
  total_ht_19: 309.916,
  tva_19: 58.884,
  timbre: 1,
};

const sum = (lines: any[], sens: 'D' | 'C') =>
  Math.round(lines.filter(l => l.sens === sens).reduce((s, l) => s + l.montant, 0) * 1000) / 1000;

test('journee avec avoir negatif : piece equilibree + avoir au credit', () => {
  const modes = { especes: 988.78, cheques: 0, tpe: 344.32, bonsAchat: 117.58, avoir: -112.4, credit: 0 };
  const r = buildDayEcritures('2026-02-17', [facture], modes, 'CLTS PASSAGERS', 'VT C');

  assert.equal(r.excluded, false);
  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));

  // bons d'achat (117,58) et avoir rendu (-112,40) se compensent : 5,180 au debit
  const avoir = r.lines.find((l: any) => l.compte === '709500');
  assert.ok(avoir, 'ligne 709500 attendue');
  assert.equal(avoir.sens, 'D');
  assert.equal(avoir.montant, 5.18);

  const ventes = r.lines.find((l: any) => l.compte === '707100');
  assert.equal(ventes.sens, 'C');
  assert.equal(ventes.montant, 906.492);
});

test('journee avec avoir seul negatif : ligne 709500 au credit, piece equilibree', () => {
  const modes = { especes: 988.78, cheques: 0, tpe: 344.32, bonsAchat: 0, avoir: -112.4, credit: 0 };
  const r = buildDayEcritures('2026-02-17', [facture], modes, 'CLTS PASSAGERS', 'VT C');

  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
  const avoir = r.lines.find((l: any) => l.compte === '709500');
  assert.equal(avoir.sens, 'C');
  assert.equal(avoir.montant, 112.4);
});

test('journee sans negatif : bons d achat au debit, piece equilibree', () => {
  const modes = { especes: 500, cheques: 0, tpe: 0, bonsAchat: 50, avoir: 0, credit: 0 };
  const r = buildDayEcritures('2026-02-17', [facture], modes, 'CLTS PASSAGERS', 'VT J.C');

  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
  const avoir = r.lines.find((l: any) => l.compte === '709500');
  assert.equal(avoir.sens, 'D');
  assert.equal(avoir.montant, 50);
  // VT J.C : comptes de vente J.C
  assert.ok(r.lines.some((l: any) => l.compte === '707200' && l.montant === 906.492));
  assert.ok(r.lines.some((l: any) => l.compte === '707219' && l.montant === 309.916));
  assert.ok(r.lines.some((l: any) => l.compte === '436711' && l.montant === 58.884));
});

test('mode credit (vente a credit) : ligne 411000 au debit, piece equilibree', () => {
  const modes = { especes: 100, cheques: 0, tpe: 0, bonsAchat: 0, avoir: 0, credit: 50 };
  const r = buildDayEcritures('2026-02-17', [facture], modes, 'CLTS PASSAGERS', 'VT C');
  const cred = r.lines.find((l: any) => l.compte === '411000');
  assert.equal(cred.sens, 'D');
  assert.equal(cred.montant, 50);
  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
});
test('encaissement negatif (remboursement especes) : ligne au credit', () => {
  const modes = { especes: -20, cheques: 0, tpe: 0, bonsAchat: 0, avoir: 0, credit: 0 };
  const r = buildDayEcritures('2026-02-17', [facture], modes, 'CLTS PASSAGERS', 'VT C');
  const caisse = r.lines.find((l: any) => l.compte === '411004');
  assert.equal(caisse.sens, 'C');
  assert.equal(caisse.montant, 20);
  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
});
