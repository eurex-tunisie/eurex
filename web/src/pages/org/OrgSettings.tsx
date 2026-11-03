import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orgApi, OrgTemplate, OrgComptable, OrgFrequency, OrgClient } from '../../lib/orgApi';
import { useOrgAuth } from '../../lib/orgAuth';
import { t } from '../../lib/orgI18n';
import { monthLabel } from '../../lib/orgMonths';
import { isValidEmail, isValidPassword } from '../../lib/orgValidate';
import { SkeletonSection } from '../../components/Skeleton';
import PwdField from '../../components/PwdField';
import { Settings, Users, ListChecks, Plus, Trash2, Eye, EyeOff, RefreshCw, Pencil, Check, X } from 'lucide-react';

type Tab = 'templates' | 'hours-costs' | 'comptables' | 'trash';
type Role = 'comptable' | 'manager' | 'expert';

const ROLE_LABEL: Record<string, string> = { comptable: 'Comptable', manager: 'Manager', expert: 'Expert' };
const ROLE_BADGE: Record<string, string> = {
  comptable: 'bg-gray-100 text-gray-600',
  manager: 'bg-purple-100 text-purple-700',
  expert: 'bg-indigo-100 text-indigo-700',
};
const RoleBadge = ({ role }: { role?: string }) => (
  <span className={`ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[role || 'comptable'] || ROLE_BADGE.comptable}`}>
    {ROLE_LABEL[role || 'comptable'] || 'Comptable'}
  </span>
);

export default function OrgSettings() {
  const { state } = useOrgAuth();
  const isExpert = state.user?.role === 'expert' || state.user?.role === 'manager';
  const [tab, setTab] = useState<Tab>('templates');
  const [templates, setTemplates] = useState<OrgTemplate[]>([]);
  const [comptables, setComptables] = useState<OrgComptable[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newNormH, setNewNormH] = useState('');
  const [newNormM, setNewNormM] = useState('');
  const [newRequiresDoc, setNewRequiresDoc] = useState(false);
  const [newAssignedComp, setNewAssignedComp] = useState('');
  const [newFrequency, setNewFrequency] = useState<OrgFrequency>('annuelle');
  const [newMonth, setNewMonth] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [billingDossiers, setBillingDossiers] = useState<any[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSearch, setBillingSearch] = useState('');
  const [billingYear, setBillingYear] = useState<number | 'all'>('all');
  const [selectedBillingDossierIds, setSelectedBillingDossierIds] = useState<string[]>([]);
  const [billingForm, setBillingForm] = useState({ amount: '', invoiced: '', collected: '', note: '' });
  const [billingSaving, setBillingSaving] = useState(false);
  const [newCompName, setNewCompName] = useState('');
  const [newCompEmail, setNewCompEmail] = useState('');
  const [newCompPassword, setNewCompPassword] = useState('');
  const [newCompHourlyCost, setNewCompHourlyCost] = useState('');
  const [editCompId, setEditCompId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPwd, setEditPwd] = useState('');
  const [editRole, setEditRole] = useState<Role>('comptable');
  const [editHourlyCost, setEditHourlyCost] = useState('');
  const [newCompRole, setNewCompRole] = useState<Role>('comptable');
  // Corbeille clients (soft-delete 30 jours)
  const [trash, setTrash] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);

  const loadTrash = async () => {
    setTrashLoading(true);
    try { setTrash(await orgApi.getTrashClients()); } catch { setTrash([]); }
    setTrashLoading(false);
  };

  const restoreFromTrash = async (id: string) => {
    try {
      await orgApi.restoreClient(id);
      loadTrash();
      setClients(await orgApi.getClients());
    } catch (e: any) { alert(e.message); }
  };

  // Le personnel inclut les superviseurs (gestion des roles) ;
  // les selects "Comptable assigné" restent limités aux comptables.
  const comps = comptables.filter(c => c.role === 'comptable');

  useEffect(() => {
    // Une route en échec ne vide pas les deux autres (cf. les tableaux de
    // bord) : on applique ce qui est venu et on journalise le reste.
    Promise.allSettled([orgApi.getTemplates(), orgApi.getComptables(), orgApi.getClients()])
      .then((results) => {
        const [rt, rc, rcl] = results;
        if (rt.status === 'fulfilled') setTemplates(rt.value);
        if (rc.status === 'fulfilled') setComptables(rc.value);
        if (rcl.status === 'fulfilled') setClients(rcl.value);
        results.forEach(r => { if (r.status === 'rejected') console.error(r.reason); });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'hours-costs') return;
    setBillingLoading(true);
    Promise.all([orgApi.getAllDossiers(), orgApi.getAllDossiers(undefined, true)])
      .then(([plain, detailed]) => {
        const costById = new Map((detailed as any[]).map(d => [d.id, d]));
        setBillingDossiers((plain as any[]).map(d => ({ ...d, ...(costById.get(d.id) || {}) })));
      })
      .catch(err => { console.error(err); setBillingDossiers([]); })
      .finally(() => setBillingLoading(false));
  }, [tab]);

  const addTemplate = async () => {
    if (!newLabel.trim()) return;
    try {
      const norm = newNormH || newNormM ? (Number(newNormH || 0) * 3600 + Number(newNormM || 0) * 60) : null;
      await orgApi.createTemplate(newLabel.trim(), newRequiresDoc, newAssignedComp || null, newFrequency, newMonth ? Number(newMonth) : null, newClientId || null, norm);
      setNewLabel('');
      setNewNormH(''); setNewNormM('');
      setNewRequiresDoc(false);
      setNewAssignedComp('');
      setNewMonth('');
      setNewClientId('');
      setTemplates(await orgApi.getTemplates());
    } catch (err: any) {
      alert(err.message);
    }
  };

  const assignTemplate = async (id: string, comptableId: string | null) => {
    try {
      await orgApi.updateTemplate(id, { assigned_comptable_id: comptableId });
      setTemplates(templates.map(t => t.id === id
        ? { ...t, assigned_comptable_id: comptableId, assigned_comptable_name: comptables.find(c => c.id === comptableId)?.full_name || null }
        : t));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const changeFrequency = async (id: string, frequency: OrgFrequency) => {
    try {
      await orgApi.updateTemplate(id, { frequency });
      // L'API detache le mois quand on passe en mensuelle/trimestrielle
      setTemplates(templates.map(t => t.id === id ? { ...t, frequency, month: frequency === 'annuelle' ? t.month : null } : t));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const changeMonth = async (id: string, month: number | null) => {
    try {
      await orgApi.updateTemplate(id, { month });
      setTemplates(templates.map(t => t.id === id ? { ...t, month } : t));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const changeNorm = async (id: string, h: number, m: number) => {
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 720 || m < 0 || m > 59) { alert('Norme invalide'); return; }
    try {
      const norm_seconds = h * 3600 + m * 60;
      await orgApi.updateTemplate(id, { norm_seconds: norm_seconds || null });
      setTemplates(templates.map(tmpl => tmpl.id === id ? { ...tmpl, norm_seconds: norm_seconds || null } : tmpl));
    } catch (err: any) { alert(err.message); }
  };

  const toggleRequiresDoc = async (id: string) => {
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;
    const next = tmpl.requires_document ? 0 : 1;
    try {
      await orgApi.updateTemplate(id, { requires_document: !!next });
      setTemplates(templates.map(t => t.id === id ? { ...t, requires_document: next } : t));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const applyTemplate = async (id: string) => {
    if (!confirm('Créer cette tâche dans tous les dossiers ouverts qui ne l\'ont pas encore ?')) return;
    try {
      const r = await orgApi.applyTemplate(id);
      alert(`${r.created} tâche(s) créée(s) dans ${r.dossiers} dossier(s)`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Supprimer ce modèle ?')) return;
    try {
      await orgApi.deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addComptable = async () => {
    if (!newCompName.trim() || !newCompEmail.trim() || !newCompPassword.trim()) return;
    if (newCompHourlyCost.trim() && (!Number.isFinite(Number(newCompHourlyCost.replace(',', '.'))) || Number(newCompHourlyCost.replace(',', '.')) < 0)) { alert('Coût horaire invalide'); return; }
    try {
      await orgApi.createComptable({
        full_name: newCompName.trim(),
        email: newCompEmail.trim(),
        password: newCompPassword.trim(),
        role: newCompRole,
        hourly_cost_cents: newCompHourlyCost.trim() ? Math.round(Number(newCompHourlyCost.replace(',', '.')) * 100) : null,
      });
      setNewCompName('');
      setNewCompEmail('');
      setNewCompPassword('');
      setNewCompRole('comptable');
      setNewCompHourlyCost('');
      setComptables(await orgApi.getComptables());
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startEditComp = (c: OrgComptable) => {
    setEditCompId(c.id);
    setEditName(c.full_name);
    setEditEmail(c.email);
    setEditPwd('');
    setEditRole(c.role || 'comptable');
    setEditHourlyCost(c.hourly_cost_cents == null ? '' : (c.hourly_cost_cents / 100).toFixed(2));
  };

  const saveEditComp = async (id: string) => {
    if (!editName.trim()) { alert('Nom requis'); return; }
    if (!isValidEmail(editEmail)) { alert('Email invalide'); return; }
    if (editPwd && !isValidPassword(editPwd)) { alert('Mot de passe : 12 caractères minimum'); return; }
    if (editHourlyCost.trim() && (!Number.isFinite(Number(editHourlyCost.replace(',', '.'))) || Number(editHourlyCost.replace(',', '.')) < 0)) { alert('Coût horaire invalide'); return; }
    try {
      const patch: { full_name?: string; email?: string; password?: string; role?: Role; hourly_cost_cents?: number | null } = {
        full_name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        hourly_cost_cents: editHourlyCost.trim() ? Math.round(Number(editHourlyCost.replace(',', '.')) * 100) : null,
      };
      if (editPwd) patch.password = editPwd;
      await orgApi.updateComptable(id, patch);
      setComptables(await orgApi.getComptables());
      setEditCompId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleComptable = async (id: string, current: number) => {
    try {
      await orgApi.toggleComptable(id, !current);
      setComptables(await orgApi.getComptables());
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <SkeletonSection />;

  if (!isExpert) return <div className="text-center py-12 text-gray-400">Accès réservé à l'expert</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
        <Settings size={20} className="text-purple-600" />
        {t('nav.settings')}
      </h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'templates' as Tab, label: t('templates.title'), icon: <ListChecks size={14} /> },
          { key: 'hours-costs' as Tab, label: 'Heures & coûts', icon: <Settings size={14} /> },
          { key: 'comptables' as Tab, label: 'Comptables', icon: <Users size={14} /> },
          { key: 'trash' as Tab, label: 'Corbeille', icon: <Trash2 size={14} /> },
        ]).map(t2 => (
          <button
            key={t2.key}
            onClick={() => { setTab(t2.key); if (t2.key === 'trash') loadTrash(); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t2.key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t2.icon} {t2.label}
          </button>
        ))}
      </div>

      {/* Tab: Templates */}
      {tab === 'templates' && (
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">{t('templates.add')}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-6 items-end gap-3">
              <div className="lg:col-span-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Libellé de la tâche"
                  className="input-field text-sm"
                  onKeyDown={e => e.key === 'Enter' && addTemplate()}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={newRequiresDoc}
                  onChange={e => setNewRequiresDoc(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t('templates.requires_doc')}
              </label>
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-gray-500 whitespace-nowrap">Norme</label>
                <input type="number" min="0" step="1" value={newNormH} onChange={e => setNewNormH(e.target.value)} className="input-sm w-16 text-sm" aria-label="Heures norme tâche" placeholder="h" />
                <span className="text-xs text-gray-400">h</span>
                <input type="number" min="0" max="59" step="1" value={newNormM} onChange={e => setNewNormM(e.target.value)} className="input-sm w-16 text-sm" aria-label="Minutes norme tâche" placeholder="min" />
                <span className="text-xs text-gray-400">min</span>
              </div>
              <select
                data-testid="template-freq-new"
                value={newFrequency}
                onChange={e => setNewFrequency(e.target.value as OrgFrequency)}
                className="input-sm text-sm"
                title={t('templates.frequency')}
              >
                <option value="annuelle">{t('templates.freq_annual')}</option>
                <option value="trimestrielle">{t('templates.freq_quarterly')}</option>
                <option value="mensuelle">{t('templates.freq_monthly')}</option>
              </select>
              <select
                data-testid="template-month-new"
                value={newMonth}
                onChange={e => setNewMonth(e.target.value)}
                className="input-sm text-sm"
                title="Mois précis de la tâche (optionnel)"
              >
                <option value="">Mois : — (selon fréquence)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <select
                data-testid="template-client-new"
                value={newClientId}
                onChange={e => setNewClientId(e.target.value)}
                className="input-field text-sm max-w-[180px]"
                title="Client cible (optionnel)"
              >
                <option value="">Client : tous les dossiers</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={newAssignedComp}
                onChange={e => setNewAssignedComp(e.target.value)}
                className="input-sm text-sm"
              >
                <option value="">Comptable : —</option>
                {comps.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>              <button
                onClick={addTemplate}
                disabled={!newLabel.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium btn btn-accent hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus size={14} /> Ajouter
              </button>
            </div>
          </div>

          {templates.map(tmpl => (
            <div key={tmpl.id} data-testid="template-row" className="card p-3 flex items-center gap-3">
              <span className="text-gray-300 text-sm">#{tmpl.order_index}</span>
              <span className="flex-1 text-sm font-medium text-gray-700">
                {tmpl.label}
                {tmpl.month ? (
                  <span
                    data-testid="template-month"
                    className="ml-2 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-semibold border border-indigo-100"
                    title="Tâche placée dans ce mois"
                  >
                    📅 {monthLabel(tmpl.month)}
                  </span>
                ) : null}
              </span>
              <div className="flex items-center gap-1" title="Norme indicative pour réaliser cette tâche">
                <span className="text-[10px] text-gray-400">Norme</span>
                <input aria-label={`Heures norme ${tmpl.label}`} type="number" min="0" max="720" defaultValue={tmpl.norm_seconds == null ? '' : Math.floor(tmpl.norm_seconds / 3600)} onBlur={e => changeNorm(tmpl.id, Number(e.target.value || 0), Number((e.currentTarget.parentElement?.querySelector('[data-norm-min]') as HTMLInputElement)?.value || 0))} data-testid="template-norm-hours" className="input-sm w-14 px-1 py-1 text-[11px]" placeholder="h" />
                <span className="text-[10px] text-gray-400">h</span>
                <input aria-label={`Minutes norme ${tmpl.label}`} data-norm-min="1" type="number" min="0" max="59" defaultValue={tmpl.norm_seconds == null ? '' : Math.floor((tmpl.norm_seconds % 3600) / 60)} onBlur={e => changeNorm(tmpl.id, Number((e.currentTarget.parentElement?.querySelector('[data-testid="template-norm-hours"]') as HTMLInputElement)?.value || 0), Number(e.target.value || 0))} className="input-sm w-14 px-1 py-1 text-[11px]" placeholder="min" />
                <span className="text-[10px] text-gray-400">min</span>
              </div>
              <span
                data-testid="template-target"
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${
                  tmpl.client_name ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}
                title="Cible du modèle"
              >
                {tmpl.client_name ? `👤 ${tmpl.client_name}` : '🏢 Tous les dossiers'}
              </span>
              <select
                data-testid="template-month-select"
                value={tmpl.month || ''}
                onChange={e => changeMonth(tmpl.id, e.target.value ? Number(e.target.value) : null)}
                onClick={e => e.stopPropagation()}
                className="input-sm px-2 py-1 text-[11px]"
                title="Mois précis de la tâche (— = selon fréquence)"
              >
                <option value="">Mois : auto</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <select
                value={tmpl.frequency || 'annuelle'}
                onChange={e => changeFrequency(tmpl.id, e.target.value as OrgFrequency)}
                onClick={e => e.stopPropagation()}
                className={`input-sm px-2 py-1 text-[11px] font-medium cursor-pointer ${ tmpl.frequency === 'mensuelle' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : tmpl.frequency === 'trimestrielle' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600' }`}
                title={t('templates.frequency')}
              >
                <option value="mensuelle">{t('templates.freq_monthly')}</option>
                <option value="trimestrielle">{t('templates.freq_quarterly')}</option>
                <option value="annuelle">{t('templates.freq_annual')}</option>
              </select>
              <button
                data-testid="template-requires-doc"
                onClick={() => toggleRequiresDoc(tmpl.id)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  tmpl.requires_document
                    ? 'bg-blue-100 text-blue-700 border-blue-200 hover:border-blue-400'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400'
                }`}
                title="Basculer : document requis pour valider la tâche"
              >
                📄 {tmpl.requires_document ? 'Doc requis' : 'Doc optionnel'}
              </button>
              <select
                value={tmpl.assigned_comptable_id || ''}
                onChange={e => assignTemplate(tmpl.id, e.target.value || null)}
                onClick={e => e.stopPropagation()}
                className="input-sm px-2 py-1 text-xs max-w-[160px]"
                title="Comptable assigné par défaut"
              >
                <option value="">Comptable : —</option>
                {comps.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
              <button
                data-testid="template-apply"
                onClick={() => applyTemplate(tmpl.id)}
                className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
                title="Appliquer aux dossiers existants"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => deleteTemplate(tmpl.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'hours-costs' && (() => {
        const visible = billingDossiers
          .filter(d => billingYear === 'all' || Number(d.exercice) === billingYear)
          .filter(d => !billingSearch || `${d.client_name || ''} ${d.comptable_name || ''}`.toLowerCase().includes(billingSearch.toLowerCase()));
        const selected = billingDossiers.filter(d => selectedBillingDossierIds.includes(d.id));
        const selectedCostCents = selected.reduce((sum, d) => sum + (Number(d.time_cost_cents) || 0), 0);
        const selectedTimeSeconds = selected.reduce((sum, d) => sum + (Number(d.total_time_seconds) || 0), 0);
        const parseMoneyCents = (s: string) => s.trim() ? Math.round(Number(s.replace(',', '.')) * 100) : null;
        const saveBilling = async () => {
          if (!selected.length) { alert('Sélectionnez au moins un dossier'); return; }
          const amount_cents = parseMoneyCents(billingForm.amount);
          const invoiced_cents = parseMoneyCents(billingForm.invoiced);
          const collected_cents = parseMoneyCents(billingForm.collected);
          const vals = [amount_cents, invoiced_cents, collected_cents].filter(x => x !== null) as number[];
          if (vals.some(x => x < 0 || !Number.isSafeInteger(x))) { alert('Montant invalide'); return; }
          setBillingSaving(true);
          try {
            await Promise.all(selected.map(d => orgApi.upsertDossierBilling(d.id, {
              quoted_cents: amount_cents,
              invoiced_cents,
              collected_cents,
              note: billingForm.note.trim() || null,
            })));
            const detailed = await orgApi.getAllDossiers(undefined, true);
            setBillingDossiers(detailed as any[]);
            setBillingForm({ amount: '', invoiced: '', collected: '', note: '' });
          } catch (err: any) { alert(err.message || 'Erreur lors de l’enregistrement'); }
          finally { setBillingSaving(false); }
        };
        return (
          <section className="space-y-4" data-testid="settings-hours-costs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card p-4"><p className="text-xs text-gray-500">Dossiers sélectionnés</p><p className="text-xl font-bold">{selected.length}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Temps pointé (coût interne)</p><p className="text-xl font-bold font-mono">{Math.floor(selectedTimeSeconds / 3600)}h{String(Math.floor(selectedTimeSeconds % 3600 / 60)).padStart(2, '0')}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Coût interne calculable</p><p className="text-xl font-bold text-emerald-700">{selected.every(d => d.time_cost_complete) && selected.length ? `${(selectedCostCents / 100).toFixed(2)} DT` : 'à compléter'}</p></div>
            </div>
            <div className="card p-4 space-y-3">
              <div><h3 className="text-sm font-semibold">Facturation client — saisie directe</h3><p className="text-xs text-gray-500 mt-1">Sélectionnez un ou plusieurs dossiers. Le montant proposé/facturé/encaissé est distinct du coût salarial interne.</p></div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <input type="number" min="0" step="0.01" value={billingForm.amount} onChange={e => setBillingForm({ ...billingForm, amount: e.target.value })} className="input-field text-sm" placeholder="Honoraires prévus (DT)" aria-label="Honoraires prévus DT" />
                <input type="number" min="0" step="0.01" value={billingForm.invoiced} onChange={e => setBillingForm({ ...billingForm, invoiced: e.target.value })} className="input-field text-sm" placeholder="Facturé (DT)" aria-label="Montant facturé DT" />
                <input type="number" min="0" step="0.01" value={billingForm.collected} onChange={e => setBillingForm({ ...billingForm, collected: e.target.value })} className="input-field text-sm" placeholder="Encaissé (DT)" aria-label="Montant encaissé DT" />
                <input type="text" maxLength={300} value={billingForm.note} onChange={e => setBillingForm({ ...billingForm, note: e.target.value })} className="input-field text-sm" placeholder="Note (optionnelle)" aria-label="Note facturation" />
                <button onClick={saveBilling} disabled={billingSaving || !selected.length} className="btn btn-accent px-3 py-2 text-sm disabled:opacity-50">{billingSaving ? 'Enregistrement…' : `Enregistrer (${selected.length})`}</button>
              </div>
            </div>
            <div className="card p-3 flex flex-wrap gap-2">
              <input type="search" value={billingSearch} onChange={e => setBillingSearch(e.target.value)} className="input-field min-w-[220px] flex-1 text-sm" placeholder="Rechercher entreprise ou comptable" aria-label="Rechercher entreprise ou comptable" />
              <select value={billingYear} onChange={e => setBillingYear(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="input-sm px-3 py-2 text-sm" aria-label="Exercice facturation">
                <option value="all">Tous exercices</option>{[...new Set(billingDossiers.map(d => Number(d.exercice)))].sort((a,b) => b-a).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={() => setSelectedBillingDossierIds(visible.map(d => d.id))} className="text-xs text-blue-700 hover:underline">Tout sélectionner ({visible.length})</button>
              <button onClick={() => setSelectedBillingDossierIds([])} className="text-xs text-gray-500 hover:underline">Effacer</button>
            </div>
            <div className="card rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-600"><th className="p-3">✓</th><th className="p-3">Entreprise / dossier</th><th className="p-3">Comptable assigné</th><th className="p-3 text-right">Temps</th><th className="p-3 text-right">Coût interne</th><th className="p-3 text-right">Honoraires prévus</th><th className="p-3 text-right">Facturé</th><th className="p-3 text-right">Encaissé</th><th className="p-3 text-right">Marge vs prévu</th></tr></thead>
                <tbody>
                  {billingLoading ? <tr><td colSpan={9} className="p-5 text-center text-gray-400">Chargement…</td></tr> : visible.map(d => {
                    const b = d.billing || {};
                    const margin = b.quoted_cents != null && d.time_cost_cents != null ? Number(b.quoted_cents) - Number(d.time_cost_cents) : null;
                    return <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50" data-testid="billing-dossier-row">
                      <td className="p-3"><input type="checkbox" aria-label={`Sélectionner ${d.client_name}`} checked={selectedBillingDossierIds.includes(d.id)} onChange={e => setSelectedBillingDossierIds(e.target.checked ? [...new Set([...selectedBillingDossierIds,d.id])] : selectedBillingDossierIds.filter(x => x !== d.id))} /></td>
                      <td className="p-3"><Link to={`/cabinet/dossier/${d.id}`} className="font-semibold text-purple-700 hover:underline">{d.client_name}</Link><span className="ml-2 text-xs text-gray-400">{d.exercice}</span></td>
                      <td className="p-3 text-gray-600">{d.comptable_name || '—'}</td><td className="p-3 text-right font-mono">{Math.floor((d.total_time_seconds||0)/3600)}h{String(Math.floor((d.total_time_seconds||0)%3600/60)).padStart(2,'0')}</td>
                      <td className="p-3 text-right text-emerald-700">{d.time_cost_cents == null ? '—' : `${(d.time_cost_cents/100).toFixed(2)} DT`}</td>
                      <td className="p-3 text-right">{b.quoted_cents == null ? '—' : `${(b.quoted_cents/100).toFixed(2)} DT`}</td><td className="p-3 text-right">{b.invoiced_cents == null ? '—' : `${(b.invoiced_cents/100).toFixed(2)} DT`}</td><td className="p-3 text-right">{b.collected_cents == null ? '—' : `${(b.collected_cents/100).toFixed(2)} DT`}</td>
                      <td className={`p-3 text-right font-semibold ${margin == null ? 'text-gray-400' : margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{margin == null ? '—' : `${(margin/100).toFixed(2)} DT`}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-500">Marge provisoire = honoraires prévus − coût salarial du temps pointé. Hors charges patronales, loyer et frais généraux.</p>
          </section>
        );
      })()}

      {/* Tab: Comptables */}
      {tab === 'comptables' && (
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">Ajouter un comptable</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
              <input
                type="text"
                value={newCompName}
                onChange={e => setNewCompName(e.target.value)}
                placeholder="Nom complet"
                className="input-field text-sm"
              />
              <input
                type="email"
                value={newCompEmail}
                onChange={e => setNewCompEmail(e.target.value)}
                placeholder="Email"
                className="input-field text-sm"
              />
              <PwdField
                value={newCompPassword}
                onChange={setNewCompPassword}
                placeholder="Mot de passe (12+ car.)"
                className="input-field text-sm"
              />
              <select
                value={newCompRole}
                onChange={e => setNewCompRole(e.target.value as Role)}
                className="input-field text-sm"
                title="Rôle du compte"
              >
                <option value="comptable">Rôle : Comptable</option>
                <option value="manager">Rôle : Manager</option>
                <option value="expert">Rôle : Expert</option>
              </select>
              <input
                type="number" min="0" step="0.01" value={newCompHourlyCost}
                onChange={e => setNewCompHourlyCost(e.target.value)}
                placeholder="Coût horaire (DT/h)" className="input-field text-sm"
                title="Coût horaire confidentiel : superviseurs seulement"
                aria-label="Coût horaire en dinars par heure"
              />
            </div>
            <button
              onClick={addComptable}
              disabled={!newCompName.trim() || !newCompEmail.trim() || newCompPassword.length < 12}
              className="px-4 py-2 rounded-lg text-sm font-medium btn btn-accent hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus size={14} /> Créer le compte
            </button>
          </div>

          {comptables.map(c => (
            <div key={c.id} className={`card p-4 flex items-center gap-4 ${c.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              {editCompId === c.id ? (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Nom complet"
                    className="input-field py-1.5 text-sm"
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="Email"
                    className="input-field py-1.5 text-sm"
                  />
                  <PwdField
                    value={editPwd}
                    onChange={setEditPwd}
                    placeholder="Nouveau mdp (vide = inchangǸ)"
                    className="input-field py-1.5 text-sm"
                  />
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as Role)}
                    className="input-field py-1.5 text-sm"
                    title="Rôle du compte"
                  >
                    <option value="comptable">Comptable</option>
                    <option value="manager">Manager</option>
                    <option value="expert">Expert</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editHourlyCost}
                    onChange={e => setEditHourlyCost(e.target.value)}
                    placeholder="Coût horaire (DT)"
                    className="input-field py-1.5 text-sm"
                    title="Coût horaire confidentiel, visible aux superviseurs"
                    aria-label="Coût horaire en dinars"
                  />
                </div>
              ) : (
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-800">{c.full_name}<RoleBadge role={c.role} /></p>
                  <p className="text-xs text-gray-500">{c.email}</p>
                  <p className="text-[11px] text-gray-400">Coût horaire : {c.hourly_cost_cents == null ? 'non renseigné' : `${(c.hourly_cost_cents / 100).toFixed(2)} DT/h`}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{c.client_count} clients</span>
                    <span>•</span>
                    <span>{c.avg_progress}% avancement</span>
                    {c.verify_stats?.score != null && (
                      <span className={c.verify_stats.score >= 90 ? 'text-emerald-600 font-medium' : c.verify_stats.score >= 75 ? 'text-amber-600 font-medium' : 'text-red-500 font-medium'} title={`Validations : ${c.verify_stats.verified} · Renvois : ${c.verify_stats.returned}`}>
                        Qualité {c.verify_stats.score}%
                      </span>
                    )}
                  </div>
                </div>
              )}

              {editCompId === c.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => saveEditComp(c.id)}
                    className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title={t('account.save')}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    onClick={() => setEditCompId(null)}
                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                    title="Annuler"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : c.id === state.user?.id ? (
                <span className="text-[10px] text-gray-400 whitespace-nowrap" title="Impossible de modifier son propre compte">
                  Votre compte
                </span>
              ) : (
                <>
                  <button
                    onClick={() => startEditComp(c)}
                    className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                    title="Modifier nom / email / mot de passe / rôle"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => toggleComptable(c.id, c.is_active)}
                    className={`p-2 rounded-lg transition-colors ${c.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={c.is_active ? 'Désactiver' : 'Activer'}
                  >
                    {c.is_active ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Corbeille — clients supprimés, restaurables 30 jours */}
      {tab === 'trash' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Les clients supprimés restent récupérables pendant 30 jours, puis sont définitivement effacés avec tous leurs dossiers.
          </p>
          {trashLoading ? (
            <SkeletonSection />
          ) : trash.length === 0 ? (
            <div className="card p-8 text-center text-sm text-gray-400">
              🗑 Corbeille vide
            </div>
          ) : (
            trash.map(c => (
              <div key={c.id} className="card px-4 py-3 flex items-center gap-3" data-testid="trash-row">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    {c.matricule_fiscal ? `MF ${c.matricule_fiscal} · ` : ''}
                    supprimé il y a {c.days_in_trash} jour{c.days_in_trash > 1 ? 's' : ''} — purge dans {Math.max(0, 30 - c.days_in_trash)} j
                  </p>
                </div>
                <button
                  onClick={() => restoreFromTrash(c.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                  data-testid="trash-restore-btn"
                >
                  <RefreshCw size={13} />
                  Restaurer
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
