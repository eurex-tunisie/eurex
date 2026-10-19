import { describe, it, expect } from 'vitest';
import dashboard from '../OrgDashboardComptable.tsx?raw';

describe('Renfort : le comptable choisit ses dossiers', () => {
  it('propose un selecteur de dossiers depuis la carte renfort', () => {
    expect(dashboard).toContain('Choisir les dossiers');
    expect(dashboard).toContain('orgApi.getClientDossiers(g.client_id)');
    expect(dashboard).toContain('data-testid={`pick-dossier-${d.exercice}`}');
  });

  it('ouvre lui-meme le grant sur les dossiers non inclus', () => {
    expect(dashboard).toContain('const grantedHere = new Set(');
    expect(dashboard).toContain('togglePickDossier');
    expect(dashboard).toContain('granted_to: authState.user.id');
  });
});
