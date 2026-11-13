import { describe, it, expect } from 'vitest';
import dashboard from '../OrgDashboardExpert.tsx?raw';
import dossierPage from '../OrgDossierPage.tsx?raw';

describe('Tab Heures & coûts : norme + écart par dossier', () => {
  it('affiche les colonnes Norme et Écart dans le tableau', () => {
    expect(dashboard).toContain('<th className="px-4 py-3 text-right">Norme</th>');
    expect(dashboard).toContain('<th className="px-4 py-3 text-right">Écart</th>');
    expect(dashboard).toContain('data-testid="hours-dossier-norm"');
    expect(dashboard).toContain('data-testid="hours-dossier-gap"');
  });

  it('signale le dépassement en rouge et le reste en vert', () => {
    expect(dashboard).toContain('⚠ +{fmtHm(Number(d.total_time_seconds) - d.task_norm_seconds_total)} au-dessus');
    expect(dashboard).toContain('text-emerald-700');
    expect(dashboard).toContain('restants');
    // le colspan du tableau couvre les 9 colonnes
    expect(dashboard).toContain('colSpan={9}');
  });

  it('calcule la norme a partir de task_norm_seconds_total (norme dossier prioritaire)', () => {
    expect(dashboard).toContain('d.task_norm_seconds_total > 0 ? fmtHm(d.task_norm_seconds_total) : ' + "'—'");
  });
});

describe('Tab Heures & coûts : journal d\'audit des normes', () => {
  it('charge le journal quand la tab est ouverte', () => {
    expect(dashboard).toContain('orgApi.getNormsAudit()');
    expect(dashboard).toContain('setNormsAudit');
  });

  it('recharge le journal apres une application de norme', () => {
    expect(dashboard).toContain('selectedBilling.map(d => orgApi.upsertDossierTaskNorm(d.id, label, norm_seconds))');
    expect(dashboard).toContain('orgApi.getNormsAudit().then(setNormsAudit)');
    // le tableau Heures lit hoursDossiers : il doit etre rafraichi aussi
    expect(dashboard).toContain('setHoursDossiers(detailed as any[])');
  });

  it('affiche qui / quelle tache / quel dossier / valeur / quand', () => {
    expect(dashboard).toContain('data-testid="norms-audit-journal"');
    expect(dashboard).toContain('data-testid="norm-audit-entry"');
    expect(dashboard).toContain('e.user_name');
    expect(dashboard).toContain('e.task_label');
    expect(dashboard).toContain('e.client_name');
    expect(dashboard).toContain('e.norm_seconds == null');
    expect(dashboard).toContain("réinitialisé au modèle");
  });
});

describe('Page dossier : norme éditable par expert/manager', () => {
  it('l\'éditeur inline appelle upsertDossierTaskNorm puis recharge', () => {
    expect(dossierPage).toContain('data-testid="task-norm-editor"');
    expect(dossierPage).toContain('await orgApi.upsertDossierTaskNorm(dossier.id, task.label, seconds)');
    expect(dossierPage).toContain('await orgApi.upsertDossierTaskNorm(dossier.id, task.label, null)');
    expect(dossierPage).toContain('load();');
  });

  it('valide la fourchette 1 minute a 30 jours comme l\'API', () => {
    expect(dossierPage).toContain('seconds < 60 || seconds > 86400 * 30');
  });

  it('le badge norme n\'est cliquable que pour un superviseur', () => {
    expect(dossierPage).toContain('if (!isExpert) return;');
    expect(dossierPage).toContain('setNormEditTaskId(task.id);');
  });
});

describe('Page dossier : message de dépassement visible partout', () => {
  it('badge rouge sur la ligne de la liste', () => {
    expect(dossierPage).toContain('data-testid="task-over-norm"');
    expect(dossierPage).toContain('au-dessus');
  });

  it('badge rouge sur la carte kanban', () => {
    expect(dossierPage).toContain('data-testid="kanban-over-norm"');
  });

  it('le detail desormais rougit quand on depasse', () => {
    expect(dossierPage).toContain('data-testid="task-norm-detail"');
    expect(dossierPage).toContain("text-red-700 bg-red-50 font-semibold");
  });
});
