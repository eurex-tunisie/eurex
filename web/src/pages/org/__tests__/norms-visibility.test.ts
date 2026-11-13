import { describe, it, expect } from 'vitest';
import dashboard from '../OrgDashboardExpert.tsx?raw';
import dossierPage from '../OrgDossierPage.tsx?raw';
import apiSrc from '../../../lib/orgApi.ts?raw';

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

describe('Tab Heures & coûts : carte « Dépassements de norme » (partie séparée)', () => {
  it('la carte est au-dessus du tableau et distincte du journal d\'audit', () => {
    expect(dashboard).toContain('data-testid="norms-overages-card"');
    expect(dashboard).toContain('data-testid="norms-audit-journal"');
    // la carte depassements apparait avant le tableau des heures
    expect(dashboard.indexOf('data-testid="norms-overages-card"')).toBeLessThan(dashboard.indexOf('data-testid="hours-dossier-row"'));
    expect(dashboard.indexOf('data-testid="norms-overages-card"')).toBeGreaterThan(dashboard.indexOf('data-testid="norms-audit-journal"'));
  });

  it('deux blocs : resume par dossier + detail des taches', () => {
    expect(dashboard).toContain('data-testid="norms-overages-dossiers"');
    expect(dashboard).toContain('data-testid="norms-overages-tasks"');
    expect(dashboard).toContain('data-testid="norms-overage-dossier"');
    expect(dashboard).toContain('data-testid="norms-overage-task"');
    // resume : dossiers ou temps total > norme, tri du pire au meilleur
    expect(dashboard).toContain('const overDossiers = filteredHoursDossiers');
    expect(dashboard).toContain('.sort((a, b) => (Number(b.total_time_seconds || 0) - Number(b.task_norm_seconds_total || 0))');
  });

  it('charge le detail des taches via /org/norms/overages', () => {
    expect(dashboard).toContain('orgApi.getNormsOverages()');
    expect(dashboard).toContain('setNormsOverages');
    // rechargement apres application d'une norme (passe par applyOverages
    // pour marquer les ids affiches comme vus)
    expect(dashboard).toContain('orgApi.getNormsOverages().then(applyOverages)');
    expect(dashboard).toContain('const applyOverages = (rows:');
  });

  it('etat vide vert quand rien ne depasse', () => {
    expect(dashboard).toContain('data-testid="norms-overages-empty"');
    expect(dashboard).toContain("Aucun dépassement de norme pour l'instant");
  });

  it('deux onglets Dossiers / Tâches (mutuellement exclusifs, texte agrandi)', () => {
    expect(dashboard).toContain("const [overTab, setOverTab] = useState<'dossiers' | 'taches'>('taches')");
    expect(dashboard).toContain('data-testid="overages-tab-dossiers"');
    expect(dashboard).toContain('data-testid="overages-tab-taches"');
    expect(dashboard).toContain(") : overTab === 'dossiers' ? (");
    // un seul bloc visible a la fois (pas de grille 2 colonnes)
    expect(dashboard).not.toContain('grid grid-cols-1 xl:grid-cols-2 gap-4');
    // lignes plus grandes
    expect(dashboard).toContain('py-2.5 text-sm');
    expect(dashboard).toContain('max-h-72 divide-y divide-gray-100');
  });

  it('orgApi expose bien la route overages', () => {
    expect(apiSrc).toContain("/org/norms/overages");
    expect(apiSrc).toContain('getNormsOverages');
  });
});

describe('Tâches détaillées : les trois rôles + motif de retard', () => {
  it('affiche assigné / pointé (qui a bossé) / terminé par', () => {
    expect(dashboard).toContain('data-testid="norms-overage-who"');
    expect(dashboard).toContain('Assigné : {t.assigned_name || ');
    expect(dashboard).toContain('Pointé : {t.workers.length ? t.workers.join');
    expect(dashboard).toContain('Terminé : {t.done_by_name || ');
  });

  it('affiche le motif de retard (late_reason) si présent', () => {
    expect(dashboard).toContain('data-testid="norms-overage-reason"');
    expect(dashboard).toContain('{t.late_reason && ');
  });

  it('orgApi typerait les nouveaux champs', () => {
    expect(apiSrc).toContain('late_reason: string | null');
    expect(apiSrc).toContain('assigned_name: string | null');
    expect(apiSrc).toContain('dossier_comptable_name: string | null');
    expect(apiSrc).toContain('done_by_name: string | null');
    expect(apiSrc).toContain('workers: string[]');
  });

  it('fallback : comptable du dossier si la tache n\'est pas assignee', () => {
    expect(dashboard).toContain('t.assigned_name || t.dossier_comptable_name || ');
    expect(dashboard).toContain("' (dossier)'");
  });
});

describe('Tâches détaillées : mois + nisbet + âge du dépassement', () => {
  it('mois de la tache en badge a cote de l\'exercice', () => {
    expect(dashboard).toContain('data-testid="norms-overage-month"');
    expect(dashboard).toContain('monthShort(t.task_month)');
    // null = decembre, cf. monthInScope
    expect(dashboard).toContain("(m && m >= 1 && m <= 12 ? MONTH_SHORT[m - 1] : 'déc.')");
    expect(apiSrc).toContain('task_month: number | null');
  });

  it('nisbet du depassement affichee entre parentheses', () => {
    expect(dashboard).toContain('data-testid="norms-overage-pct"');
    expect(dashboard).toContain('const overPct = (gap: number, norm: number)');
    // norme 0 : pas de pourcentage (pas de division par zero)
    expect(dashboard).toContain('(norm > 0 ? `${Math.round((Number(gap) / Number(norm)) * 100)}%` : null)');
    expect(apiSrc).toContain('over_since_days: number | null');
  });

  it('age du depassement : « depuis Xj » ou « aujourd\'hui »', () => {
    expect(dashboard).toContain('data-testid="norms-overage-since"');
    expect(dashboard).toContain('depuis ${t.over_since_days}j');
    expect(dashboard).toContain('"aujourd\'hui"');
  });

  it('les taches depassees « aujourd\'hui » passent en toute fin de liste', () => {
    expect(dashboard).toContain('const overagesSorted = [...normsOverages].sort');
    // cle : today (over_since_days === 0) = 1 (fin), sinon ecart descendant
    expect(dashboard).toContain('(a.over_since_days === 0 ? 1 : 0) - (b.over_since_days === 0 ? 1 : 0)');
    expect(dashboard).toContain('Number(b.gap_seconds) - Number(a.gap_seconds)');
    // le rendu lit la version triée
    expect(dashboard).toContain('{overagesSorted.map(t => (');
  });
});

describe('Badge NEW : tâche de dépassement pas encore vue', () => {
  it('marque NEW uniquement si le task_id n\'est pas dans le localStorage', () => {
    expect(dashboard).toContain('data-testid="norms-overage-new"');
    expect(dashboard).toContain('!seenOverages.has(t.task_id)');
    expect(dashboard).toContain("localStorage.getItem('eurex_overages_seen')");
  });

  it('enregistre les ids affiches (300 max) sans vider le badge en cours', () => {
    expect(dashboard).toContain("localStorage.setItem('eurex_overages_seen'");
    expect(dashboard).toContain('arr.slice(-300)');
    // l'etat vu n'est PAS mis a jour au chargement : le badge reste visible
    // jusqu'a la prochaine ouverture de la carte
    expect(dashboard).toContain('const [seenOverages] = useState<Set<string>>');
  });
});
