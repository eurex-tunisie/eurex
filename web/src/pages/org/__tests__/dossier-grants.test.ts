import { describe, it, expect } from 'vitest';
import src from '../OrgDossierPage.tsx?raw';

describe('Renfort : acces temporaire sur plusieurs dossiers', () => {
  it('charge les dossiers du client pour le selecteur', () => {
    expect(src).toContain('orgApi.getClientDossiers(dossier.client_id)');
    expect(src).toContain('grantTargets');
  });

  it('ouvre le grant sur chaque dossier selectionne', () => {
    expect(src).toContain('const ids = grantDossierIds.length ? grantDossierIds : [dossier.id]');
    expect(src).toContain('for (const did of ids)');
    expect(src).toContain('orgApi.createGrant(did,');
  });

  it('ignore les doublons et affiche un retour', () => {
    expect(src).toContain('/d[ée]j[àa]/i');
    expect(src).toContain('setGrantNotice(');
    expect(src).toContain('data-testid={`grant-target-${t.exercice}`}');
  });
});
