import { describe, it, expect } from 'vitest';
import dashboard from '../OrgDashboardExpert.tsx?raw';

describe('Renfort depuis le dashboard expert', () => {
  it('propose un bouton Renfort sur chaque carte comptable', () => {
    expect(dashboard).toContain('data-testid={`card-renfort-${c.id}`}');
    expect(dashboard).toContain('openRenfort(c)');
  });

  it('ouvre les dossiers choisis au comptable selectionne', () => {
    expect(dashboard).toContain('orgApi.getClientDossiers(clientId)');
    expect(dashboard).toContain('granted_to: grantComp.id');
    expect(dashboard).toContain('data-testid="renfort-submit"');
  });

  it('liste les renforts en cours et permet de les revoquer', () => {
    expect(dashboard).toContain('data-testid="renforts-encours"');
    expect(dashboard).toContain('data-testid="renforts-empty"');
    expect(dashboard).toContain('orgApi.revokeGrant(g.dossier_id, g.id)');
    expect(dashboard).toContain('orgApi.getGrantsAll()');
  });
});
