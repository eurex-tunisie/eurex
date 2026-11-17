import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { orgApi, OrgRecentTag } from '../lib/orgApi';

const parse = (s: string) => Date.parse(String(s).replace(' ', 'T') + 'Z');
const keyOf = (t: OrgRecentTag) => `${t.task_id}|${t.tagged_at}`;

// Tags recus (collaboration inter-comptables) — toast des qu'un nouveau tag arrive.
// Poll 60 s, pause si l'onglet est cache. Pas de toast au premier chargement.
export default function TagsRecus() {
  const [toast, setToast] = useState<OrgRecentTag | null>(null);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      orgApi.getRecentTags().then(r => {
        if (!alive) return;
        const list = r.tags || [];
        if (known.current === null) {
          known.current = new Set(list.map(keyOf));
        } else {
          const fresh = list.find(t => !known.current!.has(keyOf(t)));
          list.forEach(t => known.current!.add(keyOf(t)));
          if (fresh) setToast(fresh);
        }
      }).catch(() => {});
    };
    pull();
    const iv = setInterval(() => { if (!document.hidden) pull(); }, 60000);
    const onFocus = () => pull();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const to = setTimeout(() => setToast(null), 20000);
    return () => clearTimeout(to);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      data-testid="tag-toast"
      className="fixed top-20 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white border-2 border-indigo-500 rounded-xl shadow-xl shadow-indigo-200/70 overflow-hidden"
    >
      <div className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 flex items-center justify-between">
        <span>👥 Nouveau tag</span>
        <button
          onClick={() => setToast(null)}
          data-testid="tag-toast-close"
          aria-label="Fermer la notification"
          className="text-white/90 hover:text-white px-1"
        >
          ✕
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-gray-800 mb-0.5" data-testid="tag-toast-label">{toast.task_label}</p>
        <p className="text-[11px] text-gray-500 mb-2" data-testid="tag-toast-dossier">
          📁 {toast.client_name} · Exercice {toast.exercice}
        </p>
        <p className="text-[11px] text-indigo-700 mb-2" data-testid="tag-toast-by">
          {toast.tagged_by_name ? `${toast.tagged_by_name} vous a tagué sur cette tâche.` : 'Vous avez été tagué sur cette tâche.'}
          {toast.tagged_at ? ` (${new Date(parse(toast.tagged_at)).toLocaleString('fr-FR')})` : ''}
        </p>
        <Link
          to={`/cabinet/dossier/${toast.dossier_id}?task=${toast.task_id}`}
          data-testid="tag-toast-link"
          className="inline-flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Voir la tâche →
        </Link>
      </div>
    </div>
  );
}
