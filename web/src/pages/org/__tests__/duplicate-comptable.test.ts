// Duplication de dossier ouverte au comptable (retour en exercice passe) :
//  1. le bouton 📋 Dupliquer n'est plus enferme dans {isExpert && (...)}
//     (le transfert, lui, reste expert) ;
//  2. defaut coherent : expert = exercice suivant, comptable = precedent ;
//  3. modal : indice « exercice passe » + bouton bloque si exercice >= en cours ;
//  4. runDuplicate appelle orgApi.duplicateDossier avec l'annee choisie.
// Lecture en « ?raw » : texte des pages, sans rendu React.
import { describe, test, expect } from 'vitest';
import dossierPage from '../OrgDossierPage.tsx?raw';
import orgApiSrc from '../../../lib/orgApi.ts?raw';

describe('bouton Dupliquer', () => {
  test('visible pour le comptable : pas dans un bloc isExpert', () => {
    const idx = dossierPage.indexOf('data-testid="btn-duplicate-dossier"');
    expect(idx).toBeGreaterThan(0);
    const before = dossierPage.slice(Math.max(0, idx - 500), idx);
    expect(before).not.toContain('{isExpert && (');
    // le libelle suit le data-testid dans le meme <button>
    expect(dossierPage.slice(idx, idx + 300)).toContain('📋 Dupliquer');
  });

  test('le transfert du client reste reserve a l expert', () => {
    const idx = dossierPage.indexOf('data-testid="btn-transfer-dossier"');
    expect(idx).toBeGreaterThan(0);
    const before = dossierPage.slice(Math.max(0, idx - 500), idx);
    expect(before).toContain('{isExpert && (');
  });

  test('annee par defaut : expert = suivant, comptable = precedent', () => {
    expect(dossierPage).toContain('setDupYear(isExpert ? dossier.exercice + 1 : dossier.exercice - 1)');
  });
});

describe('modal duplication (comptable)', () => {
  test('indice « exercice passe » affiche hors expert', () => {
    expect(dossierPage).toContain('{!isExpert && (');
    expect(dossierPage).toContain('data-testid="dup-hint-past"');
    expect(dossierPage).toContain('Comptable : vers un exercice passé uniquement');
  });

  test('soumission bloque si exercice non passe (comptable)', () => {
    expect(dossierPage).toContain('(!isExpert && dupYear >= new Date().getFullYear())');
    expect(dossierPage).toContain('disabled={dupBusy || dupYear === dossier.exercice || (!isExpert && dupYear >= new Date().getFullYear())}');
  });

  test('runDuplicate envoie le choix vers l API puis navigue', () => {
    expect(dossierPage).toContain('const res = await orgApi.duplicateDossier(dossier.id, { exercice: dupYear });');
    expect(dossierPage).toContain('navigate(`/cabinet/dossier/${res.id}`);');
  });
});

describe('orgApi', () => {
  test('duplicateDossier POST /org/dossiers/:id/duplicate', () => {
    expect(orgApiSrc).toContain('duplicateDossier: (dossierId: string, body: { exercice?: number; client_id?: string } = {})');
    expect(orgApiSrc).toMatch(/`\/org\/dossiers\/\$\{dossierId\}\/duplicate`, \{ method: 'POST', body: JSON\.stringify\(body\) \}/);
  });
});
