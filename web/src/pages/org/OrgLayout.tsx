import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useOrgAuth } from '../../lib/orgAuth';
import { getLang, onLangChange, t, Lang } from '../../lib/orgI18n';
import { SkeletonAuth } from '../../components/Skeleton';
import PwdField from '../../components/PwdField';
import OrgLogin from './OrgLogin';
import OrgDashboardComptable from './OrgDashboardComptable';
import OrgDashboardExpert from './OrgDashboardExpert';
import OrgDossierPage from './OrgDossierPage';
import OrgSettings from './OrgSettings';
import OrgComptableDetail from './OrgComptableDetail';
import OrgSearch from '../../components/OrgSearch';
import OrgNotifications from '../../components/OrgNotifications';
import OrgPlanning from './OrgPlanning';
import OrgReport from './OrgReport';
import OrgMesTaches from './OrgMesTaches';
import { CheckSquare, CalendarDays, BarChart3 } from 'lucide-react';

function OrgInner() {
  const { state } = useOrgAuth();
  const [lang, setLangState] = useState<Lang>(getLang());
  const location = useLocation();
  const navigate = useNavigate();
  const onPlanning = location.pathname.startsWith('/cabinet/planning');

  useEffect(() => {
    return onLangChange(() => setLangState(getLang()));
  }, []);

  if (state.loading) {
    return <SkeletonAuth />;
  }

  if (!state.user) return <OrgLogin />;

  const isExpert = state.user.role === 'expert' || state.user.role === 'manager';

  // Must change password screen
  if (state.user.must_change_password) {
    return <ChangePasswordScreen />;
  }

  // Nav + footer gérés par App (une seule barre, un seul footer sur tout le site)
  return (
    <div className="flex-1">
      <div className="max-w-7xl mx-auto px-4 py-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <OrgSearch />
          </div>
          <button
            onClick={() => navigate('/cabinet/mes-taches')}
            data-testid="mes-taches-nav"
            title="Toutes mes tâches (filtres : statut, retard, assignation)"
            className={`btn-tab mb-4 shrink-0 ${location.pathname.startsWith('/cabinet/mes-taches') ? 'active' : ''}`}
          >
            <CheckSquare size={15} />
            Mes tâches
          </button>
          <button
            onClick={() => navigate('/cabinet/planning')}
            data-testid="planning-nav"
            title="Planning des échéances et tâches par date"
            className={`btn-tab mb-4 shrink-0 ${onPlanning ? 'active' : ''}`}
          >
            <CalendarDays size={15} />
            Planning
          </button>
          <button
            onClick={() => navigate('/cabinet/report')}
            data-testid="report-nav"
            title="Rapport mensuel (PDF / Excel)"
            className={`btn-tab mb-4 shrink-0 ${location.pathname.startsWith('/cabinet/report') ? 'active' : ''}`}
          >
            <BarChart3 size={15} />
            Rapport
          </button>
          <OrgNotifications />
        </div>
        <Routes>
          <Route path="/" element={isExpert ? <OrgDashboardExpert /> : <OrgDashboardComptable />} />
          <Route path="/mes-taches" element={<OrgMesTaches />} />
          <Route path="/planning" element={<OrgPlanning />} />
          <Route path="/report" element={<OrgReport />} />
          <Route path="/dossier/:id" element={<OrgDossierPage />} />
          <Route path="/settings" element={isExpert ? <OrgSettings /> : <Navigate to="/cabinet" />} />
          <Route path="/comptable/:id" element={isExpert ? <OrgComptableDetail /> : <Navigate to="/cabinet" />} />
          <Route path="*" element={<Navigate to="/cabinet" />} />
        </Routes>
      </div>
    </div>
  );
}

function ChangePasswordScreen() {
  const { changePassword } = useOrgAuth();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPwd.length < 12) { setError(t('auth.min_12_chars')); return; }
    if (newPwd !== confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true);
    try {
      await changePassword(current, newPwd);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="bg-white rounded-2xl shadow-modal animate-rise p-8 w-full max-w-md">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 mb-2">{t('auth.change_password')}</h2>
        <p className="text-sm text-gray-500 mb-6">Vous devez changer votre mot de passe par défaut.</p>
        <form onSubmit={submit}>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Mot de passe actuel</label>
          <PwdField value={current} onChange={setCurrent} name="current-password" autoComplete="current-password" className="input-field mb-4 text-sm" />

          <label className="block text-xs font-semibold text-gray-700 mb-1">{t('auth.new_password')}</label>
          <PwdField value={newPwd} onChange={setNewPwd} name="new-password" autoComplete="new-password" placeholder="12 caractères minimum" className="input-field mb-4 text-sm" />

          <label className="block text-xs font-semibold text-gray-700 mb-1">Confirmer</label>
          <PwdField value={confirm} onChange={setConfirm} name="confirm-password" autoComplete="new-password" className="input-field mb-4 text-sm" />

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-accent w-full py-2.5 font-semibold">
            {loading ? '...' : 'Changer'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OrgLayout() {
  return <OrgInner />;
}
