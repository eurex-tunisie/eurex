import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { doitOublierSession } from './orgSession';

const BASE = import.meta.env.VITE_API_URL || 'https://eurex-api.ezzinesalim21.workers.dev/api';

export interface OrgUser {
  id: string;
  full_name: string;
  email: string;
  role: 'expert' | 'manager' | 'comptable';
  must_change_password: number;
  organization: string;
}

const TOKEN_KEY = 'eurex_org_token';
const USER_KEY = 'eurex_org_user';

// Utilisateur deja connu sur cet appareil (dernier /org/auth/me reussi).
function lireUtilisateurEnCache(): OrgUser | null {
  try {
    const brut = localStorage.getItem(USER_KEY);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

function oublierSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

interface OrgAuthState {
  token: string | null;
  user: OrgUser | null;
  loading: boolean;
}

const OrgAuthContext = createContext<{
  state: OrgAuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (current: string, newPwd: string) => Promise<void>;
  refreshMe: () => Promise<void>;
}>({ state: { token: null, user: null, loading: true }, login: async () => {}, logout: () => {}, changePassword: async () => {}, refreshMe: async () => {} });

export function OrgAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrgAuthState>(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    return {
      token,
      user: token ? lireUtilisateurEnCache() : null,
      loading: !!token,
    };
  });

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setState({ token: null, user: null, loading: false }); return; }
    const enCache = lireUtilisateurEnCache();
    try {
      const r = await fetch(`${BASE}/org/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        // Seul un refus du serveur (401) deconnecte. Un 500, un Worker
        // indisponible ou un reseau coupe laissent la session en place : on
        // repart de l'utilisateur deja connu sur cet appareil.
        if (doitOublierSession(r.status)) { oublierSession(); setState({ token: null, user: null, loading: false }); return; }
        setState({ token, user: enCache, loading: false });
        return;
      }
      const user = await r.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      setState({ token, user, loading: false });
    } catch {
      // Reseau indisponible (telephone hors ligne) : la session reste ouverte.
      setState({ token, user: enCache, loading: false });
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = async (email: string, password: string) => {
    const r = await fetch(`${BASE}/org/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur de connexion');
    // Demander au navigateur d'enregistrer les identifiants (gestionnaire de mots de passe)
    try {
      const w = window as any;
      if (typeof w.PasswordCredential === 'function' && navigator.credentials?.store) {
        await navigator.credentials.store(new w.PasswordCredential({ id: email, password }));
      }
    } catch { /* API non supportee ou refusee par le navigateur */ }
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setState({ token: data.token, user: data.user, loading: false });
  };

  const logout = () => {
    oublierSession();
    setState({ token: null, user: null, loading: false });
  };

  const changePassword = async (current: string, newPwd: string) => {
    const r = await fetch(`${BASE}/org/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ current_password: current, new_password: newPwd }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur');
    // Update local state
    const updatedUser = { ...state.user!, must_change_password: 0 };
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    setState(s => ({ ...s, user: updatedUser }));
  };

  return (
    <OrgAuthContext.Provider value={{ state, login, logout, changePassword, refreshMe }}>
      {children}
    </OrgAuthContext.Provider>
  );
}

export function useOrgAuth() {
  return useContext(OrgAuthContext);
}
