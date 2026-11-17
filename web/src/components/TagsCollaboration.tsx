import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orgApi, OrgRecentTag } from '../lib/orgApi';
import { t } from '../lib/orgI18n';

const fmtDate = (s: string) => {
  const ms = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return isNaN(ms) ? '' : new Date(ms).toLocaleDateString('fr-FR');
};

// Carte permanente : taches ou je suis tague (collaboration), 30 derniers jours.
// Visible uniquement s'il y a au moins un tag. Rafraichissement 60 s (pause onglet cache).
export default function TagsCollaboration() {
  const [tags, setTags] = useState<OrgRecentTag[]>([]);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      orgApi.getRecentTags(30)
        .then(r => { if (alive) setTags(r.tags || []); })
        .catch(() => {});
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

  if (tags.length === 0) return null;

  return (
    <div className="card rounded-2xl p-4" data-testid="tags-collaboration">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
        👥 Collaboration
        <span className="text-gray-400 font-normal">— tâches où vous êtes tagué</span>
        <span className="ml-1 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full">
          {tags.length}
        </span>
      </h3>
      <div className="divide-y divide-gray-100">
        {tags.map(tg => (
          <Link
            key={`${tg.task_id}|${tg.tagged_at}`}
            to={`/cabinet/dossier/${tg.dossier_id}?task=${tg.task_id}`}
            data-testid="tag-collab-row"
            className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-lg hover:bg-indigo-50/60 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{tg.task_label}</p>
              <p className="text-[11px] text-gray-500 truncate">
                📁 {tg.client_name} · Exercice {tg.exercice}
                {tg.tagged_by_name ? ` · tagué par ${tg.tagged_by_name}` : ''}
                {tg.tagged_at ? ` · ${fmtDate(tg.tagged_at)}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {t(`status.${tg.task_status}`)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
