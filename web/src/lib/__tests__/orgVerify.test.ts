// File de validation : ce que l'expert doit encore valider et le taux deja
// valide. Ces deux nombres alimentent la carte comptable du dashboard expert
// (« ✅ N à vérifier », « 🔍 Validé X% · en attente Y% ») et la carte « En attente
// de validation » du dashboard comptable. Sans ces tests, un arrondi faux, un
// 0 % trompeur (comptable sans historique de validation) ou une date d'horloge
// mal convertie (SQLite ecrit en UTC sans « Z ») passeraient inapercus.
import { describe, test, expect } from 'vitest';
import { verifyRate, pendingRate, verifyRateTone, pendingVerify, elapsedLabel } from '../orgVerify';

describe('verifyRate : part du travail deja valide', () => {
  test('aucune donnee : null, pas 0 % (un comptable sans historique ne vaut pas 0 %)', () => {
    expect(verifyRate(undefined)).toBe(null);
    expect(verifyRate(null)).toBe(null);
    expect(verifyRate({ validated: 0, pending: 0 })).toBe(null);
  });

  test('tout en attente : 0 %', () => {
    expect(verifyRate({ validated: 0, pending: 3 })).toBe(0);
    expect(pendingRate({ validated: 0, pending: 3 })).toBe(100);
  });

  test('tout valide : 100 %, rien en attente', () => {
    expect(verifyRate({ validated: 3, pending: 0 })).toBe(100);
    expect(pendingRate({ validated: 3, pending: 0 })).toBe(0);
  });

  test('mixte : arrondi entier et complement a 100', () => {
    expect(verifyRate({ validated: 1, pending: 2 })).toBe(33);
    expect(pendingRate({ validated: 1, pending: 2 })).toBe(67);
    expect(verifyRate({ validated: 2, pending: 1 })).toBe(67);
    expect(verifyRate({ validated: 46, pending: 0 })).toBe(100);
    expect(verifyRate({ validated: 0, pending: 46 })).toBe(0);
  });

  test('valeurs absurdes (negatif, NaN) ramenees a 0', () => {
    expect(verifyRate({ validated: -5, pending: 2 })).toBe(0);
    expect(verifyRate({ validated: 5, pending: NaN })).toBe(100);
  });
});

describe('verifyRateTone : seuils d affichage', () => {
  test('>= 90 vert, >= 60 orange, sinon rouge, aucune donnee = neutre', () => {
    expect(verifyRateTone(undefined)).toBe('none');
    expect(verifyRateTone({ validated: 9, pending: 1 })).toBe('good');
    expect(verifyRateTone({ validated: 6, pending: 4 })).toBe('warn');
    expect(verifyRateTone({ validated: 1, pending: 3 })).toBe('bad');
  });
});

describe('pendingVerify : le compteur serveur fait foi', () => {
  test('compteur serveur present : utilise, meme quand il vaut 0', () => {
    expect(pendingVerify({ validated: 10, pending: 0 }, 7)).toBe(0);
    expect(pendingVerify({ validated: 1, pending: 2 }, 9)).toBe(2);
  });

  test('compteur absent (ancien Worker) : repli sur la liste de l expert', () => {
    expect(pendingVerify(undefined, 4)).toBe(4);
    expect(pendingVerify(null)).toBe(0);
  });
});

describe('elapsedLabel : chrono en cours', () => {
  // Horodatage SQLite : UTC, ecrit sans « Z » (ex: datetime('now'))
  const at = (iso: string) => iso;
  const now = Date.parse('2026-10-18T10:30:00Z');

  test('moins d une minute', () => {
    expect(elapsedLabel(at('2026-10-18 10:29:35'), now)).toBe("à l'instant");
  });

  test('minutes et heures (heure locale TN = UTC+1 : 09:30 UTC = 10:30 locale)', () => {
    expect(elapsedLabel(at('2026-10-18 10:18:00'), now)).toBe('12 min');
    expect(elapsedLabel(at('2026-10-18 09:25:00'), now)).toBe('1 h 05');
    expect(elapsedLabel(at('2026-10-18 00:30:00'), now)).toBe('10 h 00');
  });

  test('sans horodatage : vide ; date future : jamais negatif', () => {
    expect(elapsedLabel(null, now)).toBe('');
    expect(elapsedLabel(undefined, now)).toBe('');
    expect(elapsedLabel(at('2026-10-18 11:00:00'), now)).toBe("à l'instant");
  });
});
