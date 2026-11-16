import { describe, it, expect } from 'vitest';
import dashboardExpert from '../OrgDashboardExpert.tsx?raw';
import dashboardComptable from '../OrgDashboardComptable.tsx?raw';
import comptableDetail from '../OrgComptableDetail.tsx?raw';
import report from '../OrgReport.tsx?raw';
import portail from '../OrgPortailClient.tsx?raw';
import search from '../../../components/OrgSearch.tsx?raw';
import apiSrc from '../../../lib/orgApi.ts?raw';

const count = (src: string, needle: string) => src.split(needle).length - 1;

describe('Dossier d\'exercice ancien : avancement « — »', () => {
  it('detail comptable : les deux affichages passent en —', () => {
    // ligne de la liste + grand pourcentage du dossier
    expect(count(comptableDetail, "d.progress == null ? '—' : ")).toBe(2);
  });

  it('rapport mensuel : — en tableau et en CSV', () => {
    expect(report).toContain('d.progress ?? ' + "'—'");
    expect(report).toContain('{d.progress == null ? (');
    // les totaux (avancement moyen cabinet) restent des nombres cotes serveur
    expect(report).toContain("['Avancement moyen (%)', t.progress]");
  });

  it('expert : barre remplacee par — et CSV inchange', () => {
    expect(dashboardExpert).toContain('data-testid="dossier-progress-none"');
    expect(dashboardExpert).toContain('{d.progress === null ? (');
    expect(dashboardExpert).toContain('d.progress ?? ' + "'—'");
  });

  it('recherche globale : affiche — quand le dossier est ancien', () => {
    expect(search).toContain('d.is_ancient ? ' + "'—' : ");
    expect(apiSrc).toContain('is_ancient');
  });
});

describe('Moyennes null-safe (numerateur ET denominateur)', () => {
  it('dashboard comptable : ignore les clients sans avancement', () => {
    expect(dashboardComptable).toContain('const clientsWithProg = clients.filter(c => c.progress !== null);');
    expect(dashboardComptable).toContain('clientsWithProg.reduce((s, c) => s + (c.progress || 0), 0) / clientsWithProg.length');
  });

  it('dashboard expert : ignore les dossiers sans avancement', () => {
    expect(dashboardExpert).toContain('const dossiersWithProg = allDossiers.filter(d => d.progress !== null);');
    expect(dashboardExpert).toContain('dossiersWithProg.reduce((s, d) => s + (d.progress || 0), 0) / dossiersWithProg.length');
  });
});

describe('Tri null-safe', () => {
  it('les progress null trient en fin de liste (MAX_SAFE_INTEGER)', () => {
    expect(dashboardComptable).toContain('const pa = a.progress ?? Number.MAX_SAFE_INTEGER;');
    expect(dashboardComptable).toContain('const pb = b.progress ?? Number.MAX_SAFE_INTEGER;');
    expect(dashboardComptable).toContain('if (sort === ' + "'progress'" + ') return pa - pb;');
    expect(dashboardComptable).toContain('|| pa - pb'); // fallback du tri « bloqué »
  });
});

describe('Portail client : avancement « — »', () => {
  it('type nullable + affichage + barre masquee', () => {
    expect(portail).toContain('dossier: { exercice: number; progress: number | null } | null;');
    expect(portail).toContain('data-testid="portal-progress"');
    expect(portail).toContain("{data.dossier.progress === null ? '—' : ");
    expect(portail).toContain('{data.dossier.progress !== null && (');
  });
});

describe('orgApi : types progress nullable', () => {
  it('OrgClient, OrgDossier et portail acceptent null', () => {
    expect(count(apiSrc, 'progress: number | null')).toBeGreaterThanOrEqual(3);
    expect(apiSrc).toContain('Avancement : null = dossier d\'exercice ancien');
  });
});
