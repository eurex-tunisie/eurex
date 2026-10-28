import { describe, it, expect } from 'vitest';
import { parseRapport } from '../rapportParser';

// Extrait reel du PDF "Rapport financier0602.pdf" (ANIMAL CITY, 02/2026).
const HEADER = `ANIMAL CITY CARE TUNISIA
CARTHAGE
VENTE PAR JOUR 17/03/2026
Du: 01/02/2026 Au: 28/02/2026 Dépôt: 6 CARTHAGE
Jour Espèce Chèque Carte de cr Bons D'ach Avoir Crédit Offre Prépayé Total Comm. AVOIR`;

const LIGNES = [
  '01/02/2026 458,65 0,00 830,70 63,50 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 1 352,85 0,000 0,000',
  '14/02/2026 3 183,79 0,00 2 384,56 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 5 568,35 0,000 0,000',
  '17/02/2026 988,78 0,00 344,32 117,58 -112,40 0,00 0,00 0,00 0,00 0,00 0,00 0,00 1 338,28 0,000 0,000',
  '25/02/2026 310,95 20,00 366,10 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 697,05 0,000 0,000',
  '28/02/2026 973,15 0,00 838,45 103,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00 1 914,60 0,000 0,000',
  'Totaux 21 649,40 20,00 14 897,80 1 644,93 -112,40 0,00 0,00 0,00 0,00 0,00 0,00 0,00 38 099,73 0,00 0,00',
];

describe('parseRapport (rapport Vente par jour)', () => {
  const modes = parseRapport([HEADER, ...LIGNES].join('\n'));

  it('lit les 5 jours et ignore la ligne Totaux / les entetes', () => {
    expect(Object.keys(modes).sort()).toEqual([
      '2026-02-01', '2026-02-14', '2026-02-17', '2026-02-25', '2026-02-28',
    ]);
  });

  it('ventile les modes (especes, cheques, carte, bons, avoir, credit)', () => {
    expect(modes['2026-02-01']).toEqual({
      especes: 458.65, cheques: 0, tpe: 830.7, bonsAchat: 63.5, avoir: 0, credit: 0,
    });
    expect(modes['2026-02-25']).toEqual({
      especes: 310.95, cheques: 20, tpe: 366.1, bonsAchat: 0, avoir: 0, credit: 0,
    });
  });

  it('lit un montant avec separateur de milliers', () => {
    expect(modes['2026-02-14'].especes).toBe(3183.79);
    expect(modes['2026-02-14'].tpe).toBe(2384.56);
  });

  it('lit le jour avec un avoir negatif (17/02/2026)', () => {
    expect(modes['2026-02-17']).toEqual({
      especes: 988.78, cheques: 0, tpe: 344.32, bonsAchat: 117.58, avoir: -112.4, credit: 0,
    });
  });

  it('accepte une ligne sans toutes les colonnes', () => {
    const m = parseRapport('03/02/2026 100,00 0,00');
    expect(m['2026-02-03']).toEqual({ especes: 100, cheques: 0, tpe: 0, bonsAchat: 0, avoir: 0, credit: 0 });
  });
});
