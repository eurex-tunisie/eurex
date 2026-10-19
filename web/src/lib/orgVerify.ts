// File de validation du cabinet : ce qui a ete rendu (statut « a_verifier ») et
// ce qui a ete valide par l'expert (statut « fait »). Deux nombres seulement,
// volontairement HORS perimetre de mois et HORS perimetre d'export : une tâche
// rendue doit etre validee quel que soit son mois, et la file « à vérifier » de
// l'expert n'est filtree ni par mois ni par export. Les deux nombres viennent donc
// du meme ensemble, sinon le taux affiche est faux.
//
// Logique pure, sans appel reseau : testee dans __tests__/orgVerify.test.ts.
// L'horloge est injectable pour que les tests ne dependent pas de la date.

export interface VerifyCounts {
  /** Tâches deja validees par l'expert (statut « fait ») */
  validated: number;
  /** Tâches rendues, en attente de validation (statut « a_verifier ») */
  pending: number;
}

const clean = (n?: number | null) => (n && n > 0 ? n : 0);

/**
 * Part du travail deja valide, sur l'ensemble de ce qui est passe en verification
 * (validees + en attente). `null` quand rien n'est encore passe en verification :
 * afficher 0 % laisserait croire qu'un comptable sans historique n'a rien valide.
 */
export function verifyRate(counts?: VerifyCounts | null): number | null {
  const validated = clean(counts?.validated);
  const pending = clean(counts?.pending);
  const total = validated + pending;
  return total > 0 ? Math.round((validated / total) * 100) : null;
}

/** Part encore en attente de validation (complement du taux, arrondi identique) */
export function pendingRate(counts?: VerifyCounts | null): number | null {
  const rate = verifyRate(counts);
  return rate == null ? null : 100 - rate;
}

export type VerifyTone = 'none' | 'good' | 'warn' | 'bad';

/** Seuils d'affichage du taux de validation : >=90 vert, >=60 orange, sinon rouge */
export function verifyRateTone(counts?: VerifyCounts | null): VerifyTone {
  const rate = verifyRate(counts);
  if (rate == null) return 'none';
  if (rate >= 90) return 'good';
  if (rate >= 60) return 'warn';
  return 'bad';
}

/**
 * File d'attente d'un comptable. Le compteur serveur (exact, sans plafond) fait
 * foi ; `fallback` (liste des tâches à vérifier de l'expert, plafonnee a 50) ne
 * sert que si l'API n'a pas renvoye le compteur (ancienne version du Worker).
 */
export function pendingVerify(counts: VerifyCounts | null | undefined, fallback?: number): number {
  return counts ? clean(counts.pending) : clean(fallback);
}

/**
 * Temps ecoule depuis un horodatage SQLite (UTC, ecrit sans « Z ») : « à
 * l'instant », « 12 min », « 1 h 05 ». Toute date future (horloge desynchronisee)
 * est ramenee a zero plutot qu'affichée en negatif.
 */
export function elapsedLabel(startedAt?: string | null, now: number = Date.now()): string {
  if (!startedAt) return '';
  const secs = Math.max(0, Math.floor((now - Date.parse(String(startedAt).replace(' ', 'T') + 'Z')) / 1000));
  if (secs < 60) return "à l'instant";
  const min = Math.floor(secs / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
