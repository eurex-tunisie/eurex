import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { orgApi, OrgClient, OrgMyGrant, OrgDossier } from '../../lib/orgApi';
import { useOrgAuth } from '../../lib/orgAuth';
import { t } from '../../lib/orgI18n';
import ProgressDonut, { DonutLegend } from '../../components/ProgressDonut';
import Skeleton, { SkeletonCardGrid, SkeletonKpiGrid } from '../../components/Skeleton';
import OrgAccountButton from '../../components/OrgAccount';
import OrgAlerts from '../../components/OrgAlerts';
import MesHeures from '../../components/MesHeures';
import NouvellesTaches from '../../components/NouvellesTaches';
import { EXPORT_LABELS } from '../../lib/orgAlerts';
import { verifyRate } from '../../lib/orgVerify';
import useExercice from '../../lib/useExercice';
import ExerciceSelect from '../../components/ExerciceSelect';
import { FolderOpen, AlertTriangle, Clock, ArrowUpDown, Search, Users, BarChart3, Hourglass, AlertCircle, FileText, CheckCircle2, Wrench, X } from 'lucide-react';

type SortKey = 'name' | 'progress' | 'blocked';

export default function OrgDashboardComptable() {
  // Filtres persistes dans l'URL (?sort=&q=) : partageables + survit au refresh
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [myGrants, setMyGrants] = useState<OrgMyGrant[]>([]);
  const { state: authState } = useOrgAuth();
  const [picking, setPicking] = useState<OrgMyGrant | null>(null);
  const [pickDossiers, setPickDossiers] = useState<OrgDossier[]>([]);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState('');
  const [exercices, setExercices] = useState<number[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>(
    (['name', 'progress', 'blocked'] as SortKey[]).includes(searchParams.get('sort') as SortKey) ? (searchParams.get('sort') as SortKey) : 'blocked'
  );
  const [search, setSearch] = useState(searchParams.get('q') || '');
  // Exercice affiche : annee courante par defaut, choix memorise (retour au n-1)
  const [exercice, setExercice] = useExercice();

  // Persistance : ecrit les filtres dans l'URL (sans boucle : compare avant d'ecrire)
  useEffect(() => {
    const p = new URLSearchParams();
    if (sort !== 'blocked') p.set('sort', sort);
    if (search) p.set('q', search);
    const next = p.toString();
    if (next !== searchParams.toString()) setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, search]);

  const load = () => {
    setLoading(true);
    // Même raison que sur le tableau de bord expert : une route en échec ne
    // doit pas effacer celles qui ont répondu. On n'affiche l'erreur que si
    // la liste des clients — le contenu principal — n'est pas venue.
    Promise.allSettled([orgApi.getClients(exercice), orgApi.getMyGrants(), orgApi.getExercices()])
      .then(([rc, rg, rex]) => {
        if (rc.status === 'fulfilled') setClients(rc.value);
        if (rg.status === 'fulfilled') setMyGrants(rg.value);
        if (rex.status === 'fulfilled') {
          const list = rex.value.exercices || [];
          setExercices(list);
          // Exercice choisi disparu (client supprime) : on retombe sur le plus recent
          if (list.length && !list.includes(exercice)) setExercice(list[0]);
        }
        [rc, rg, rex].forEach(r => { if (r.status === 'rejected') console.error(r.reason); });
        setLoadError(rc.status !== 'fulfilled');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [exercice]);

  // Renfort : le comptable choisit lui-meme les dossiers du client (acces
  // deja ouvert sur un dossier, l'API reprend la duree et l'echeance du renfort)
  const openPicker = async (g: OrgMyGrant) => {
    setPicking(g);
    setPickError('');
    setPickDossiers([]);
    try {
      setPickDossiers(await orgApi.getClientDossiers(g.client_id));
    } catch (err: any) { setPickError(err.message || 'Erreur'); }
  };

  const grantedHere = new Set(
    picking ? myGrants.filter(x => x.client_id === picking.client_id).map(x => x.dossier_id) : []
  );

  const togglePickDossier = async (d: OrgDossier) => {
    if (!picking || !authState.user || grantedHere.has(d.id) || pickBusy) return;
    setPickBusy(true);
    setPickError('');
    try {
      await orgApi.createGrant(d.id, {
        granted_to: authState.user.id,
        days: picking.days,
        reason: 'Renfort : dossier choisi par le comptable',
      });
      setMyGrants(await orgApi.getMyGrants());
    } catch (err: any) { setPickError(err.message || 'Erreur'); }
    finally { setPickBusy(false); }
  };

  const filtered = clients
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.matricule_fiscal?.includes(search))
    .sort((a, b) => {
      if (sort === 'blocked') return b.task_stats.bloque_client - a.task_stats.bloque_client || a.progress - b.progress;
      if (sort === 'progress') return a.progress - b.progress;
      return a.name.localeCompare(b.name);
    });

  // Renforts limites a l'exercice affiche
  const grantsVisible = myGrants.filter(g => !g.exercice || g.exercice === exercice);

  // Synthese de ma charge. Derive des clients deja charges : aucune requete
  // supplementaire, donc aucun cout D1 en plus pour plus de detail.
  const sumTotal = clients.reduce((s, c) => s + (c.task_stats?.total || 0), 0);
  const sumFait = clients.reduce((s, c) => s + (c.task_stats?.fait || 0), 0);
  const sumBloque = clients.reduce((s, c) => s + (c.task_stats?.bloque_client || 0), 0);
  const blockedClients = clients.filter(c => (c.task_stats?.bloque_client || 0) > 0).length;
  const docsTotal = clients.reduce((s, c) => s + (c.doc_stats?.total || 0), 0);
  const docsRecus = clients.reduce((s, c) => s + (c.doc_stats?.received || 0), 0);
  const docsMissing = Math.max(0, docsTotal - docsRecus);
  const closedClients = clients.filter(c => c.dossier_actuel?.status === 'cloture').length;
  const avgProgress = clients.length > 0
    ? Math.round(clients.reduce((s, c) => s + (c.progress || 0), 0) / clients.length * 10) / 10
    : 0;
  // File de validation : ce que j'ai rendu et qui attend la validation de l'expert
  // (tous mois confondus). Derive des clients deja charges : aucune requete en plus.
  const sumValidated = clients.reduce((s, c) => s + (c.verify_counts?.validated || 0), 0);
  const sumPending = clients.reduce((s, c) => s + (c.verify_counts?.pending || 0), 0);
  const validationRate = verifyRate({ validated: sumValidated, pending: sumPending });

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="flex gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      <SkeletonKpiGrid count={7} />
      <SkeletonCardGrid count={6} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">{t('dash.my_clients')}</h2>
        <div className="flex items-center gap-3">
          <ExerciceSelect value={exercice} options={exercices} onChange={setExercice} />
          <span className="text-sm text-gray-500">{clients.length} client{clients.length > 1 ? 's' : ''}</span>
          <OrgAccountButton />
        </div>
      </div>

      {/* API indisponible : ne PAS afficher une liste vide qui ressemble a des clients/dossiers perdus */}
      {loadError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-sm text-rose-700">
          <span>Chargement impossible : l'API est momentanément indisponible. Aucune donnée n'a été supprimée.</span>
          <button onClick={load} className="shrink-0 px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors">Réessayer</button>
        </div>
      )}

      {/* KPIs — synthese de ma charge : clients, avancement, reste a faire,
          blocages, documents manquants. Avant, ce tableau de bord n'avait
          aucun compteur : on ne voyait le retard qu'en parcourant les cartes. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Mes clients', value: clients.length, icon: <Users size={16} />, color: 'blue',
            sub: `${closedClients} clôturé${closedClients > 1 ? 's' : ''} · ${filtered.length} affiché${filtered.length > 1 ? 's' : ''}` },
          { label: 'Avancement moyen', value: `${avgProgress}%`, icon: <BarChart3 size={16} />, color: 'emerald',
            sub: `${sumFait} / ${sumTotal} tâches faites` },
          { label: 'Tâches restantes', value: sumTotal - sumFait, icon: <Hourglass size={16} />, color: 'gray',
            sub: `sur ${sumTotal} tâches au total` },
          { label: 'Bloqué client', value: sumBloque, icon: <AlertCircle size={16} />, color: sumBloque > 0 ? 'red' : 'gray',
            sub: `${blockedClients} client${blockedClients > 1 ? 's' : ''} concerné${blockedClients > 1 ? 's' : ''}` },
          { label: 'Documents manquants', value: docsMissing, icon: <FileText size={16} />, color: docsMissing > 0 ? 'orange' : 'gray',
            sub: `${docsRecus} / ${docsTotal} reçus` },
          { label: 'Clients clôturés', value: closedClients, icon: <CheckCircle2 size={16} />, color: 'emerald',
            sub: `sur ${clients.length} au total` },
          { label: 'En attente de validation', value: sumPending, icon: <Clock size={16} />, color: sumPending > 0 ? 'amber' : 'gray',
            sub: validationRate == null ? 'rien encore passé en validation' : `${validationRate}% validé · ${sumValidated} validée${sumValidated > 1 ? 's' : ''}` },
        ].map((kpi, i) => {
          const bgMap: Record<string, string> = {
            blue: 'bg-blue-50',
            emerald: 'bg-emerald-50',
            red: 'bg-red-50',
            amber: 'bg-amber-50',
            orange: 'bg-orange-50',
            gray: 'bg-white',
          };
          const valMap: Record<string, string> = {
            blue: 'text-blue-700',
            emerald: 'text-emerald-700',
            red: 'text-red-700',
            amber: 'text-amber-700',
            orange: 'text-orange-600',
            gray: 'text-gray-700',
          };
          return (
            <div key={i} className={`${bgMap[kpi.color] || 'bg-white'} shadow-card rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`${valMap[kpi.color] || 'text-gray-700'}`}>{kpi.icon}</span>
                <span className="text-xs" style={{ color: 'var(--label-2)' }}>{kpi.label}</span>
              </div>
              <p className={`text-2xl font-bold tracking-tight ${valMap[kpi.color] || 'text-gray-800'}`}>{kpi.value}</p>
              {kpi.sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--label-3)' }}>{kpi.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Nouvelles tâches — dernières tâches ajoutées aux dossiers accessibles */}
      <NouvellesTaches exercice={exercice} />

      {/* Mes heures — realises vs norme 8h30 (lun-ven), repos sam-dim, solde net */}
      <MesHeures exercice={exercice} />

      {/* Échéances fiscales — alertes dates butoirs */}
      <OrgAlerts />

      {/* Dossiers en renfort (acces temporaire ouvert par l'expert) */}
      {grantsVisible.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
            <Wrench size={14} />
            Dossiers en renfort
            <span className="text-gray-400 font-normal">— accès temporaire ouvert par l'expert</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grantsVisible.map(g => (
              <Link
                key={g.id}
                to={`/cabinet/dossier/${g.dossier_id}`}
                className="bg-amber-50 shadow-card rounded-xl p-4 card-hover group"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-bold text-sm text-gray-800 group-hover:text-amber-700 truncate">{g.client_name}</h4>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap"><Wrench size={10} /> Renfort</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Exercice {g.exercice} · {g.days === 0 ? 'accès à vie' : `expire le ${String(g.expires_at).slice(0, 16)}`}
                </p>
                {g.reason && <p className="text-[11px] text-gray-500 italic truncate">« {g.reason} »</p>}
                <button
                  type="button"
                  data-testid={`pick-dossiers-${g.dossier_id}`}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); openPicker(g); }}
                  className="mt-2 text-[11px] font-semibold text-amber-800 bg-white/80 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-white transition-colors"
                >
                  Choisir les dossiers
                </button>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search + Sort */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            className="input-field pl-9 py-2"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'blocked' as SortKey, label: '⚠' },
            { key: 'progress' as SortKey, label: '%' },
            { key: 'name' as SortKey, label: 'A-Z' },
          ]).map(s => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                sort === s.key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client cards */}
      {filtered.length === 0 && (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--label-3)' }}>
          {t('dash.no_clients')}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map(client => {
          const hasBlocked = client.task_stats.bloque_client > 0;
          const hasMissingDocs = client.doc_stats.total > client.doc_stats.received;
          const d = client.dossier_actuel;

          return (
            <Link
              key={client.id}
              data-testid="client-card"
              to={`/cabinet/dossier/${d?.id || ''}`}
              className={`group card card-hover rounded-2xl p-5 relative overflow-hidden ${
                hasBlocked ? 'bg-red-50/40' : ''
              }`}
            >
              {/* Badges */}
              {hasBlocked && (
                <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold animate-pulse">
                  <AlertTriangle size={12} />
                  {t('dash.blocked')}
                </span>
              )}
              {hasMissingDocs && !hasBlocked && (
                <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-600 text-[11px] font-medium">
                  📄 Manquant
                </span>
              )}

              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <ProgressDonut
                  fait={client.task_stats.fait}
                  enCours={client.task_stats.en_cours}
                  bloqueClient={client.task_stats.bloque_client}
                  size={104}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 text-base group-hover:text-purple-700 transition-colors truncate">{client.name}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {client.matricule_fiscal && (
                      <p className="text-[11px] text-gray-400 font-mono">{client.matricule_fiscal}</p>
                    )}
                    {client.export_status && (
                      <span className="text-[10px] font-semibold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded-full" title="Statut export du client">
                        {EXPORT_LABELS[client.export_status] || client.export_status}
                      </span>
                    )}
                  </div>
                  {d && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Exercice {d.exercice}{d.status === 'cloture' && <> — <span className="font-medium">{t('status.cloture')}</span></>}
                    </p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg font-medium">
                  {client.task_stats.total - client.task_stats.fait} {t('dash.tasks_remaining')}
                </span>
                {client.task_stats.bloque_client > 0 && (
                  <span className="bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-semibold">
                    🔴 {client.task_stats.bloque_client} bloqué{client.task_stats.bloque_client > 1 ? 's' : ''} client
                  </span>
                )}
              </div>

              {/* Detail par client : deux chiffres absents de la carte. La
                  pastille ci-dessus donne les taches restantes et la legende
                  les taches faites ; il manquait le total et les documents
                  attendus (doc_stats, deja renvoye par /api/org/clients). */}
              <div className="grid grid-cols-2 gap-2 text-center text-[11px] mb-3">
                <div className="bg-gray-50 rounded-lg py-1.5">
                  <div className="font-bold text-gray-800">{client.task_stats.total}</div>
                  <div className="text-gray-400">Tâches</div>
                </div>
                <div className={`rounded-lg py-1.5 ${hasMissingDocs ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <div className={`font-bold ${hasMissingDocs ? 'text-orange-600' : 'text-gray-800'}`}>
                    {client.doc_stats.received}<span className="text-gray-400 font-normal">/{client.doc_stats.total}</span>
                  </div>
                  <div className={hasMissingDocs ? 'text-orange-500' : 'text-gray-400'}>Documents</div>
                </div>
              </div>

              {/* Legend */}
              <DonutLegend
                fait={client.task_stats.fait}
                enCours={client.task_stats.en_cours}
                bloqueClient={client.task_stats.bloque_client}
                className="pt-3 border-t border-gray-100"
              />

              {/* Last activity indicator */}
              {d && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-[11px] text-gray-400">
                  <Clock size={12} />
                  <span>{t('dash.open_dossier')}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {picking && (
        <div className="modal-overlay" onClick={() => setPicking(null)}>
          <div className="modal-panel p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-base tracking-tight">Dossiers — {picking.client_name}</h3>
              <button type="button" className="icon-btn" onClick={() => setPicking(null)} title="Fermer"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Choisissez les dossiers sur lesquels vous intervenez. Ceux marqués « inclus » sont déjà ouverts.
            </p>
            {pickError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{pickError}</p>}
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {pickDossiers.map(d => {
                const included = grantedHere.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-testid={`pick-dossier-${d.exercice}`}
                    disabled={pickBusy || included}
                    onClick={() => togglePickDossier(d)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      included
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-white border-gray-200 hover:border-amber-300'
                    } disabled:opacity-80`}
                  >
                    <span className="font-medium">Exercice {d.exercice}</span>
                    <span className="text-[11px] text-gray-500">
                      {d.status === 'cloture' ? 'clôturé' : 'en cours'}{included ? ' · inclus' : ''}
                    </span>
                  </button>
                );
              })}
              {pickDossiers.length === 0 && !pickError && <p className="text-xs text-gray-400 py-2">Chargement…</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
