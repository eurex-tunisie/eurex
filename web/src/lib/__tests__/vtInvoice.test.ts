import { describe, it, expect } from 'vitest';
import { parseInvoice } from '../vtInvoice';

// Extraits reels (ANIMAL CITY, 02/2026) reconstruits comme le fait pdf.ts :
// une ligne = un groupe d'items sur la meme ordonnee.

const LIGNES_NORMALE = [
  'ANIMAL CITY CARE',
  'LE  :  17/02/2026  Page :  1',
  'Code Client :  99',
  'Client  :  CLIENTS PASSAGERS',
  'FACTURE N∞:  2026 / 106',
  'CODE  DESIGNATION  TVA  QTE  P.U.HT  REM  TOTAL H.T.',
  'CACHET ET SIGNATURE  ASSIETTE  TAUX  MONT. TVA  TOTAL H.T. :  1 161,42',
  '822,180  0%  NET H.TVA  :  1 161,42',
  '7%  TOTAL TVA :  64,46',
  '13%  TIMBRE FIS. :  1,00',
  '339,243  19%  64,456',
  'NET T.T.C.  1 226,88',
].join('\n');

// Facture 105 (17/02/2026) : vente avec REMISE — l'assiette 0% (112,40) est
// deja nette, mais le libelle "NET H.TVA" est sur une autre ligne.
const LIGNES_REMISE = [
  'ANIMAL CITY CARE',
  'LE  17/02/2026  Page :  1',
  'Code Client :  127',
  'Client  :  SOCIETE MIMOSA PARA',
  'FACTURE N∞:  2026 /105',
  '8680067143616  Mio Cat Milk Powder - 200 g  0,00  1,000  36,50  36,50  0,00  36,500',
  '4014355217057  DC PACK LAIT CHATON 300GR  0,00  1,000  104,00  104,00  0,00  104,000',
  'CACHET ET SIGNATURE  ASSIETTE  TAUX  MONT. TVA  TOTAL H.T. :  140,50',
  '112,40  0%  REMISE  :  28,10',
  '7%  NET H.TVA  :  112,40',
  '13%  TIMBRE FIS. :  1,00',
  '19%  TOTAL TVA :',
  'NET T.T.C.  113,40',
].join('\n');

// Facture 125 (26/02/2026) : 0% + 19%, gros montants avec espaces.
const LIGNES_19 = [
  'LE  :  26/02/2026  Page :  1',
  'Client  :  CLIENTS PASSAGERS',
  'FACTURE N∞:  2026 / 125',
  'CACHET ET SIGNATURE  ASSIETTE  TAUX  MONT. TVA  TOTAL H.T. :  1 632,67',
  '1 287,550  0%  NET H.TVA  :  1 632,67',
  '7%  TOTAL TVA :  65,57',
  '13%  TIMBRE FIS. :  1,00',
  '345,124  19%  65,574',
  'NET T.T.C.  1 699,25',
].join('\n');

describe('parseInvoice (factures ANIMAL CITY)', () => {
  it('lit une facture normale (0% + 19%)', () => {
    expect(parseInvoice(LIGNES_NORMALE)).toEqual({
      date: '2026-02-17', numero: '2026/106', client: 'CLIENTS PASSAGERS',
      ht0: 822.18, ht19: 339.243, tva19: 64.456, timbre: 1, ttc: 1226.88,
    });
  });

  it('lit une facture avec remise (assiette 0% nette)', () => {
    const inv = parseInvoice(LIGNES_REMISE);
    expect(inv.ht0).toBe(112.4);
    expect(inv.ht19).toBe(0);
    expect(inv.tva19).toBe(0);
    expect(inv.timbre).toBe(1);
    expect(inv.ttc).toBe(113.4);
  });

  it('lit les montants avec espaces de milliers', () => {
    const inv = parseInvoice(LIGNES_19);
    expect(inv.ht0).toBe(1287.55);
    expect(inv.ht19).toBe(345.124);
    expect(inv.tva19).toBe(65.574);
    expect(inv.ttc).toBe(1699.25);
  });
});
