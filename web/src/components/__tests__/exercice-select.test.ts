// Selecteur d'exercice du dashboard : le badge d'alerte ne s'affiche QUE
// quand on est HORS exercice courant (bug livre : la condition etait
// inversee — « exercice precedent » s'affichait sur 2026 et disparaissait
// justement quand on basculait sur une ancienne annee).
// Lecture en « ?raw » : texte du composant, sans rendu React.
import { describe, test, expect } from 'vitest';
import selectSrc from '../ExerciceSelect.tsx?raw';

describe('badge exercice', () => {
  test('rendu conditionne a showBadge (non inverse)', () => {
    expect(selectSrc).toContain('{showBadge && (');
    expect(selectSrc).not.toContain('{!showBadge && (');
  });

  test('showBadge = hors exercice courant (ou valeur libre hors 0)', () => {
    expect(selectSrc).toContain('const isCurrent = value === cur || (allowAll && value === 0);');
    expect(selectSrc).toContain('const showBadge = !isCurrent && !(allowAll && value === 0);');
  });

  test('libelle : passe = « exercice precedent », futur = « exercice suivant »', () => {
    expect(selectSrc).toContain("value > cur ? t('dash.exercice_next') : t('dash.exercice_previous')");
    expect(selectSrc).toContain('data-testid="dash-exercice-badge"');
  });
});

describe('options et pilotage', () => {
  test('annees proposees = options (dossiers accessibles) + l annee courante', () => {
    expect(selectSrc).toContain('const years = Array.from(new Set([value, ...(options.length ? options : [currentExercice()])])).sort((a, b) => b - a);');
    expect(selectSrc).toContain('data-testid={`dash-exercice-${y}`}');
  });

  test('allowAll : option « Tous les exercices » (value 0)', () => {
    expect(selectSrc).toContain('{allowAll && <option value={0} data-testid="dash-exercice-all">Tous les exercices</option>}');
  });

  test('selection propagee via onChange (rechargement du dashboard)', () => {
    expect(selectSrc).toContain('onChange={e => onChange(Number(e.target.value))}');
    expect(selectSrc).toContain('data-testid="dash-exercice"');
  });

  test('annee non courante : style ambre (attention visuelle)', () => {
    expect(selectSrc).toContain("${ isCurrent ? 'bg-white text-gray-800' : 'bg-amber-50 border-amber-300 text-amber-800' }");
  });
});
