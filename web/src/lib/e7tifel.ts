// Module Cabinet « e7tifel » : règle de fin de tâche.
//
// Au moment de marquer une tâche « fait », on compare le temps passé
// (total_time_seconds + chronos encore ouverts) à la norme :
//   - dans les temps (temps <= norme) → UNE vidéo de célébration au hasard ;
//   - après la norme (temps > norme)  → boîte obligatoire « motif du retard » ;
//   - aucune norme                    → ni vidéo ni motif.
// La norme utilisée est celle déjà calculée par l'API :
// effective_norm_seconds (norme du dossier) ?? norm_seconds (norme de la tâche).

export type E7tifelDecision = 'video' | 'motif' | null;

// Nombre de vidéos embarquées dans public/e7tifel/ (v1.mp4 … vN.mp4)
export const E7TIFEL_VIDEOS = 6;

// Une seule vidéo, choisie au hasard parmi les N embarquées (1-indexé).
export function e7tifelPickIndex(count: number = E7TIFEL_VIDEOS): number {
  return Math.floor(Math.random() * count) + 1;
}

export function e7tifelDecision(
  norm: number | null | undefined,
  elapsed: number,
): E7tifelDecision {
  if (norm == null || !Number.isFinite(norm) || norm <= 0) return null;
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  return elapsed <= norm ? 'video' : 'motif';
}
