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

test('mode credit : exclu du calcul de 634500 et piece equilibree (pas de ligne 411000)', () => {
  const base = { especes: 1300, cheques: 0, tpe: 0, bonsAchat: 0, avoir: 0 };
  const sansCredit = buildDayEcritures('2026-02-17', [facture], { ...base, credit: 0 }, 'CLTS PASSAGERS', 'VT C');
  const avecCredit = buildDayEcritures('2026-02-17', [facture], { ...base, credit: 50 }, 'CLTS PASSAGERS', 'VT C');
  const e1 = sansCredit.lines.find((l: any) => l.compte === '634500');
  const e2 = avecCredit.lines.find((l: any) => l.compte === '634500');
  assert.equal(avecCredit.lines.some((l: any) => l.compte === '411000'), false);
  // le credit ne doit rien changer a l'ecart
  assert.equal(e2.montant, e1.montant);
  assert.equal(e2.montant, Math.round((1300 - (906.492 + 309.916 + 58.884 + 1)) * 1000) / 1000);
  assert.equal(sum(avecCredit.lines, 'D'), sum(avecCredit.lines, 'C'));
});
test('encaissement negatif (remboursement especes) : ligne au credit', () => {
  const modes = { especes: -20, cheques: 0, tpe: 0, bonsAchat: 0, avoir: 0, credit: 0 };
  const r = buildDayEcritures('2026-02-17', [facture], modes, 'CLTS PASSAGERS', 'VT C');
  const caisse = r.lines.find((l: any) => l.compte === '411004');
  assert.equal(caisse.sens, 'C');
  assert.equal(caisse.montant, 20);
  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
});

test('jour d encaissement sans facture : caisse au debit, ecart 634500 au credit', () => {
  // Cas reel 28/01/2026 depot J.C : 4 924,62 encaisses, aucune facture du jour.
  const modes = { especes: 2400, cheques: 0, tpe: 2524.62, bonsAchat: 0, avoir: 0, credit: 0 };
  const r = buildDayEcritures('2026-01-28', [], modes, 'CLTS PASSAGERS', 'VT J.C');
  const ecart = r.lines.find((l: any) => l.compte === '634500');
  assert.ok(ecart, 'ligne 634500 attendue');
  assert.equal(ecart.sens, 'C');
  assert.equal(ecart.montant, 4924.62);
  assert.equal(r.lines.some((l: any) => l.compte === '411000'), false);
  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
});

test('facture hors caisse (vente client) : 411000 au debit, 634500 ne la compte pas', () => {
  // Cas reel 24/01/2026 J.C : SOGEPLAN 2026/48 (8 438,62) a cote de la vente
  // comptoir 2026/51 (5 361,98) -> l ecart doit tomber a -1 DT (timbre), pas -8 439,62.
  const sog = { numero_facture: '2026/48', client: 'SOGEPLAN', total_ht_0: 0, total_ht_19: 7090.434, tva_19: 1347.182, timbre: 1, total_ttc: 8438.62, hors_caisse: 1 };
  const cpt = { numero_facture: '2026/51', client: '99', total_ht_0: 4088.286, total_ht_19: 1069.492, tva_19: 203.203, timbre: 1, total_ttc: 5361.98 };
  const modes = { especes: 2548.98, cheques: 0, tpe: 2424.60, bonsAchat: 387.40, avoir: 0, credit: 73.70 };
  const r = buildDayEcritures('2026-01-24', [sog, cpt], modes, 'CLTS PASSAGERS', 'VT J.C');

  assert.equal(sum(r.lines, 'D'), sum(r.lines, 'C'));
  assert.equal(r.ecart, -0.997);
  const client = r.lines.find((l: any) => l.compte === '411000');
  assert.ok(client, 'ligne 411000 attendue');
  assert.equal(client.sens, 'D');
  assert.equal(client.montant, 8438.62);
  assert.equal(client.libelle, 'SOGEPLAN');
});
