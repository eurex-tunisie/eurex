import { useState } from 'react';

const LS_KEY = 'eurex_dash_exercice';

// Exercice courant (annee locale)
export function currentExercice(): number {
  return new Date().getFullYear();
}

// Exercice affiche sur le dashboard : annee courante par defaut, choix memorise
// (permet de revenir sur l'exercice precedent une fois le nouveau ouvert)
export default function useExercice(opts?: { defaultAll?: boolean }): [number, (y: number) => void] {
  const [exercice, setState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isInteger(n) && n >= 0 && n <= 2100) return n;
      }
    } catch { /* stockage indisponible */ }
    return opts?.defaultAll ? 0 : currentExercice();
  });
  const setExercice = (y: number) => {
    setState(y);
    try { localStorage.setItem(LS_KEY, String(y)); } catch { /* stockage indisponible */ }
  };
  return [exercice, setExercice];
}
