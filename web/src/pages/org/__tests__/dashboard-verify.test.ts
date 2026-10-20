// Garde-fous d'affichage de la file de validation (dashboard expert + comptable).
// Le contrat est volontairement verifie sur la source des pages :
//  1. « N à vérifier » et « Qualité » restent VISIBLES meme a 0 — avant, la puce
//     disparaissait et l'expert ne pouvait pas voir qu'une verification restait a
//     faire (c'etait tout l'objet de la demande) ;
//  2. le taux et la file viennent du meme compteur serveur (verify_counts), avec
//     le seul repli prevu sur la liste de l'expert ;
//  3. « ce qu'elle fait maintenant » (chrono en cours) est visible sur la carte,
//     sans ouvrir la fiche comptable.
// Les fichiers sont importes en « ?raw » : le test lit le texte des pages, il ne
// les execute pas (pas de rendu React, pas de DOM).
import { describe, test, expect } from 'vitest';
import expertPage from '../OrgDashboardExpert.tsx?raw';
import comptablePage from '../OrgDashboardComptable.tsx?raw';
import orgApiSrc from '../../../lib/orgApi.ts?raw';

describe('carte comptable (dashboard expert)', () => {
  test('la page ne redefinit pas la logique : elle importe la lib orgVerify', () => {
    expect(expertPage).toContain("from '../../lib/orgVerify'");
    expect(expertPage).not.toContain('const verifyRate =');
  });

  test('« N à vérifier » toujours affiche, meme a 0', () => {
    expect(expertPage).not.toContain('(unverifiedByComptable[c.id] || 0) > 0 &&');
    expect(expertPage).toContain('pendingVerify(counts, fallback)');
    expect(expertPage).toContain('<VerifyPendingBadge counts={c.verify_counts} fallback={unverifiedByComptable[c.id]} comptableId={c.id} />');
    expect(expertPage).toContain('à vérifier');
  });

  test('« Qualité » toujours affichee : plus de rendu conditionnel sur le score', () => {
    expect(expertPage).not.toContain('c.verify_stats?.score != null &&');
    expect(expertPage).toContain("Qualité {c.verify_stats?.score == null ? '—'");
  });

  test('taux de validation affiche avec les compteurs serveur', () => {
    expect(expertPage).toContain('<VerifyRateBadge counts={c.verify_counts} />');
    expect(expertPage).toContain('data-testid="card-verify-rate"');
    expect(expertPage).toContain('Validé {rate == null');
    expect(expertPage).toContain('en attente {pending == null');
  });

  test('ce qu elle fait maintenant : chrono en cours sur la carte', () => {
    expect(expertPage).toContain('c.active_timer');
    expect(expertPage).toContain('elapsedLabel(c.active_timer.started_at)');
    expect(expertPage).toContain('Ne travaille pas actuellement');
  });

  test('les lignes de puces passent a la ligne au lieu de deborder', () => {
    // Avec les puces toujours visibles, une ligne non wrappee deborderait de la carte
    const flexRows = expertPage.split('flex-wrap items-center').length - 1;
    expect(flexRows).toBeGreaterThanOrEqual(2);
  });

  test('le manager est affiche comme les comptables (il a partout les droits d un expert)', () => {
    expect(expertPage).toContain("cs.filter(c => c.role === 'comptable' || c.role === 'manager')");
    expect(expertPage).not.toContain("cs.filter(c => c.role === 'comptable');");
    expect(expertPage).toContain('orgApi.getComptables().then(dashTeam)');
  });
});

describe('carte « En attente de validation » (dashboard comptable)', () => {
  test('le compteur est derive des clients charges (aucune requete en plus)', () => {
    expect(comptablePage).toContain('c.verify_counts?.pending || 0');
    expect(comptablePage).toContain('c.verify_counts?.validated || 0');
    expect(comptablePage).toContain("label: 'En attente de validation'");
  });

  test('le taux vient de la meme fonction que cote expert', () => {
    expect(comptablePage).toContain("import { verifyRate } from '../../lib/orgVerify'");
    expect(comptablePage).toContain('verifyRate({ validated: sumValidated, pending: sumPending })');
  });

  test('le squelette de chargement suit le nombre de cartes', () => {
    expect(comptablePage).toContain('<SkeletonKpiGrid count={7} />');
  });
});

describe('contrat API consomme par les deux pages', () => {
  test('les types exposent verify_counts et active_timer', () => {
    expect(orgApiSrc).toContain('verify_counts?: VerifyCounts;');
    expect(orgApiSrc).toContain('active_timer?: { task_label: string; started_at: string; dossier_id?: string | null } | null;');
  });
});
