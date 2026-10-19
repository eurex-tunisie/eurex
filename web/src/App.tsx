import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import DossierPage from './pages/DossierPage';
import BaudSocietes from './pages/baud/BaudSocietes';
import BaudDossierPage from './pages/baud/BaudDossierPage';
import BaudParametres from './pages/baud/BaudParametres';
import ScanSocietes from './pages/scanflash/ScanSocietes';
import ScanDossierPage from './pages/scanflash/ScanDossierPage';
import EtatsFinanciers from './pages/ef/EtatsFinanciers';
import AchatsSocietes from './pages/achats/AchatsSocietes';
import AchatsDossierPage from './pages/achats/AchatsDossierPage';
import OrgLayout from './pages/org/OrgLayout';
import OrgPortailClient from './pages/org/OrgPortailClient';
import QuotaIndicator from './components/QuotaIndicator';
import { OrgAuthProvider, useOrgAuth } from './lib/orgAuth';
import { getLang, setLang, onLangChange, initLang, t } from './lib/orgI18n';
import { Building2, LayoutDashboard, Settings, LogOut, Globe } from 'lucide-react';

initLang();

function GlobalNav({ path }: { path: string }) {
  const { state, logout } = useOrgAuth();
  const [lang, setLangState] = useState(getLang());

  useEffect(() => onLangChange(() => setLangState(getLang())), []);

  const onCabinet = path.startsWith('/cabinet');
  const cabUser = onCabinet && state.user && !state.user.must_change_password ? state.user : null;

  return (
    <nav className="vibrancy sticky top-0 z-50 border-b" style={{ borderColor: 'var(--separator)' }}>
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-1">
        <Link to="/" className="flex items-center gap-2 mr-4">
          <span className="text-lg font-bold tracking-tight">EUREX</span>
        </Link>
        <div className="flex gap-1 border-l pl-4" style={{ borderColor: 'var(--separator)' }}>
          <Link to="/" className={`nav-link ${path === '/' ? 'active' : ''}`}>
            Dossiers
          </Link>
          <Link to="/achats" className={`nav-link ${path.startsWith('/achats') ? 'active' : ''}`}>
            ACHATS
          </Link>
          <Link to="/ef" className={`nav-link ${path.startsWith('/ef') ? 'active' : ''}`}>
            EF
          </Link>
          <Link to="/baud/societes" className={`nav-link ${path.startsWith('/baud') ? 'active' : ''}`}>
            BAUD
          </Link>
          <Link to="/scanflash" className={`nav-link ${path.startsWith('/scanflash') ? 'active' : ''}`}>
            SCANFLASH
          </Link>
          <Link to="/cabinet" className={`nav-link ${onCabinet ? 'active' : ''}`}>
            <Building2 size={14} />
            CABINET
          </Link>

          {/* Onglets Cabinet fusionnés dans la nav globale (une seule barre) */}
          {cabUser && (
            <>
              <Link
                to="/cabinet"
                className={`nav-link ${path === '/cabinet' ? 'active' : ''}`}
              >
                <LayoutDashboard size={14} />
                {cabUser.role === 'expert' || cabUser.role === 'manager' ? 'Dashboard' : t('dash.my_clients')}
              </Link>
              {(cabUser.role === 'expert' || cabUser.role === 'manager') && (
                <Link
                  to="/cabinet/settings"
                  className={`nav-link ${path.includes('/settings') ? 'active' : ''}`}
                >
                  <Settings size={14} />
                  {t('nav.settings')}
                </Link>
              )}
            </>
          )}
        </div>
        <QuotaIndicator />

        {/* Infos utilisateur + langue + déconnexion (une seule fois, nav globale) */}
        {cabUser && (
          <div className="flex items-center gap-2 pl-3 border-l ml-2" style={{ borderColor: 'var(--separator)' }}>
            <button
              onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')}
              className="icon-btn"
              title={lang === 'fr' ? 'العربية' : 'Français'}
            >
              <Globe size={16} />
            </button>
            <div className="text-right">
              <p className="text-xs font-semibold" style={{ color: 'var(--label)' }}>{cabUser.full_name}</p>
              <p className="text-[10px]" style={{ color: 'var(--label-3)' }}>{cabUser.organization || cabUser.role}</p>
            </div>
            <button
              onClick={logout}
              className="icon-btn icon-btn-danger"
              title={t('nav.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  const loc = useLocation();
  const path = loc.pathname;
  const onCabinet = path.startsWith('/cabinet');
  // Portail client public : page autonome, sans nav ni footer internes
  const onPortail = path.startsWith('/portail');

  return (
    <OrgAuthProvider>
      <div className="min-h-screen flex flex-col">
        {!onPortail && <GlobalNav path={path} />}
        {/* /cabinet : conteneur sans padding → le login pleine largeur, les pages cabinet gèrent leur propre max-w */}
        <main className={onCabinet || onPortail ? 'flex-1 flex flex-col' : 'max-w-7xl mx-auto px-4 py-6 w-full'}>
          <Routes>
            {/* Organization module — has its own layout with auth */}
            <Route path="/cabinet/*" element={<OrgLayout />} />

            {/* Portail client public (lien tokenise, genere depuis le dossier) */}
            <Route path="/portail/:token" element={<OrgPortailClient />} />

            {/* Existing routes */}
            <Route path="/" element={<Home />} />
            <Route path="/dossier/:id" element={<DossierPage />} />
            <Route path="/baud/societes" element={<BaudSocietes />} />
            <Route path="/baud/parametres" element={<BaudParametres />} />
            <Route path="/baud/dossier/:id" element={<BaudDossierPage />} />
            <Route path="/scanflash" element={<ScanSocietes />} />
            <Route path="/scanflash/dossier/:id" element={<ScanDossierPage />} />
            <Route path="/ef" element={<EtatsFinanciers />} />
            <Route path="/achats" element={<AchatsSocietes />} />
            <Route path="/achats/dossier/:id" element={<AchatsDossierPage />} />
          </Routes>
        </main>
        {!onPortail && (
          <footer className="border-t mt-10" style={{ borderColor: 'var(--separator)' }}>
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between text-xs" style={{ color: 'var(--label-3)' }}>
              <span>EUREX — Générateur d'Écritures Comptables IA</span>
              <span>Created by med salim ezzine</span>
            </div>
          </footer>
        )}
      </div>
    </OrgAuthProvider>
  );
}
