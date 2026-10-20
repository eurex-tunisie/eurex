import { describe, it, expect } from 'vitest';
import dashboard from '../OrgDashboardExpert.tsx?raw';

describe('Renfort depuis le dashboard expert', () => {
  it('propose un bouton Renfort sur chaque carte comptable', () => {
    expect(dashboard).toContain('data-testid={`card-renfort-${c.id}`}');
    expect(dashboard).toContain('openRenfort(c)');
  });

  it('ouvre les dossiers choisis au comptable selectionne', () => {
    expect(dashboard).toContain('orgApi.getClientDossiers(clientId)');
    expect(dashboard).toContain('const activeDossier = grantComp?.active_timer?.dossier_id');
    expect(dashboard).toContain("d.id === activeDossier");
    expect(dashboard).toContain('granted_to: grantComp.id');
    expect(dashboard).toContain('data-testid="renfort-submit"');
    expect(dashboard).toContain("label: '6 mois'");
    expect(dashboard).toContain("label: '1 an'");
    expect(dashboard).toContain("label: 'À vie'");
  });

  it('permet de selectionner des dossiers sur plusieurs clients', () => {
    expect(dashboard).toContain('data-testid="renfort-selected"');
    expect(dashboard).toContain('data-testid={`renfort-remove-${p.id}`}');
    expect(dashboard).toContain("prev.filter(x => x.id !== d.id)");
    expect(dashboard).not.toContain('grantIds');
  });

  it('liste les renforts en cours et permet de les revoquer', () => {
    expect(dashboard).toContain('data-testid="renforts-encours"');
    expect(dashboard).toContain('data-testid="renforts-empty"');
    expect(dashboard).toContain('orgApi.revokeGrant(g.dossier_id, g.id)');
    expect(dashboard).toContain('orgApi.getGrantsAll()');
  });
});
