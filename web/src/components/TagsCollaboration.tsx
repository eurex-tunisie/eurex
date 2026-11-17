import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orgApi, OrgRecentTag } from '../lib/orgApi';
import { t } from '../lib/orgI18n';

const pad2 = (n: number) => String(n).padStart(2, '0');

const fmtDate = (s: string) => {
  const ms = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return isNaN(ms) ? '' : new Date(ms).toLocaleDateString('fr-FR');
};

// Date SQL « YYYY-MM-DD HH:MM:SS » (UTC) -> timestamp ms
const sqlMs = (s: string) => {
  const ms = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return isNaN(ms) ? 0 : ms;
};

// Durée pointée : « 1h25 » / « 45min »
const fmtDur = (secs: number) => {
  const s = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${pad2(m)}` : `${m}min`;
};

// Chrono live : « 00:12:34 »
const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.round(secs || 0));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};

// Saisie rapide : « 45 » = minutes, « 1h30 » / « 1:30 » / « 1,5h » = heures+minutes.
// Retourne des secondes, ou null si la saisie est invalide.
export function parseDuration(input: string): number | null {
  const v = String(input || '').trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (!v) return null;
  let secs: number | null = null;
  let m = v.match(/^(\d+):([0-5]?\d)$/);
  if (m) secs = Number(m[1]) * 3600 + Number(m[2]) * 60;
  if (secs === null && (m = v.match(/^(\d+)h(\d{0,2})$/))) {
    const mins = m[2] ? Number(m[2]) : 0;
    if (mins < 60) secs = Number(m[1]) * 3600 + mins * 60;
  }
  if (secs === null && (m = v.match(/^(\d+(?:\.\d+)?)h$/))) secs = Math.round(Number(m[1]) * 3600);
  if (secs === null && (m = v.match(/^(\d+)$/))) secs = Number(m[1]) * 60;
  if (secs === null || !Number.isFinite(secs) || secs <= 0 || secs > 86400) return null;
  return secs;
}

// Carte permanente : taches ou je suis tague (collaboration), 30 derniers jours.
// Pointage direct : chrono + saisie manuelle sans ouvrir le dossier.
// Visible uniquement s'il y a au moins un tag. Rafraichissement 60 s (pause onglet cache).
export default function TagsCollaboration() {
  const [tags, setTags] = useState<OrgRecentTag[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [durText, setDurText] = useState('');
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const r = await orgApi.getRecentTags(30);
      setTags(r.tags || []);
    } catch {
      // silencieux : la carte ne doit pas casser le dashboard
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  // Compteur live tant qu'au moins un chrono tourne
  const anyRunning = tags.some(tg => !!tg.my_timer_started_at);
  useEffect(() => {
    if (!anyRunning) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [anyRunning]);

  if (tags.length === 0) return null;

  const toggleTimer = async (tg: OrgRecentTag) => {
    setErr('');
    setBusyId(tg.task_id);
    try {
      if (tg.my_timer_started_at) await orgApi.stopTimer(tg.dossier_id, tg.task_id);
      else await orgApi.startTimer(tg.dossier_id, tg.task_id);
      setEditId(null);
      setDurText('');
      await load();
      setNow(Date.now());
    } catch (e: any) {
      setErr(e?.message || 'Action impossible');
    } finally {
      setBusyId(null);
    }
  };

  const submitTime = async (tg: OrgRecentTag) => {
    const secs = parseDuration(durText);
    if (!secs) {
      setErr('Durée invalide — ex. 45 (minutes) ou 1h30');
      return;
    }
    setErr('');
    setBusyId(tg.task_id);
    try {
      await orgApi.addTaskTime(tg.dossier_id, tg.task_id, secs);
      setEditId(null);
      setDurText('');
      await load();
      setNow(Date.now());
    } catch (e: any) {
      setErr(e?.message || 'Saisie impossible');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card rounded-2xl p-4" data-testid="tags-collaboration">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
        👥 Collaboration
        <span className="text-gray-400 font-normal">— tâches où vous êtes tagué</span>
        <span className="ml-1 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full">
          {tags.length}
        </span>
      </h3>
      {err && <p className="text-[11px] text-red-600 mb-1" data-testid="tag-collab-error">{err}</p>}
      <div className="divide-y divide-gray-100">
        {tags.map(tg => {
          const running = tg.my_timer_started_at || null;
          const elapsed = running ? Math.floor((now - sqlMs(running)) / 1000) : 0;
          const busy = busyId === tg.task_id;
          return (
            <div
              key={`${tg.task_id}|${tg.tagged_at}`}
              data-testid="tag-collab-item"
              className="flex items-start gap-2 py-2 -mx-2 px-2 rounded-lg hover:bg-indigo-50/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/cabinet/dossier/${tg.dossier_id}?task=${tg.task_id}`}
                  data-testid="tag-collab-row"
                  className="block"
                >
                  <p className="text-sm font-semibold text-gray-800 truncate">{tg.task_label}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    📁 {tg.client_name} · Exercice {tg.exercice}
                    {tg.tagged_by_name ? ` · tagué par ${tg.tagged_by_name}` : ''}
                    {tg.tagged_at ? ` · ${fmtDate(tg.tagged_at)}` : ''}
                  </p>
                </Link>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-[11px] text-purple-600" data-testid="tag-collab-my-time" title="Votre temps pointé sur cette tâche (compte dans vos heures, pas dans la norme)">
                    ⏱ {fmtDur(tg.my_seconds || 0)} pointé
                  </span>
                  {running && (
                    <span className="text-[11px] font-semibold text-emerald-600" data-testid="tag-collab-running">
                      ▶ en cours {fmtClock(elapsed)}
                    </span>
                  )}
                </div>
                {editId === tg.task_id && (
                  <form
                    className="flex items-center gap-1 mt-1"
                    onSubmit={e => { e.preventDefault(); submitTime(tg); }}
                  >
                    <input
                      autoFocus
                      value={durText}
                      onChange={e => setDurText(e.target.value)}
                      placeholder="45 ou 1h30"
                      data-testid="tag-collab-time-input"
                      className="border border-indigo-200 rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none w-24"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      data-testid="tag-collab-time-save"
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditId(null); setDurText(''); setErr(''); }}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      ✕
                    </button>
                  </form>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {t(`status.${tg.task_status}`)}
                </span>
                <div className="flex items-center gap-1">
                  {running ? (
                    <button
                      type="button"
                      onClick={() => toggleTimer(tg)}
                      disabled={busy}
                      data-testid="tag-collab-timer-stop"
                      title="Arrêter mon chrono sur cette tâche"
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      ⏹ Arrêter
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleTimer(tg)}
                      disabled={busy}
                      data-testid="tag-collab-timer-start"
                      title="Démarrer mon chrono sur cette tâche (sans ouvrir le dossier)"
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      ▶ Pointer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setErr('');
                      setEditId(editId === tg.task_id ? null : tg.task_id);
                      setDurText('');
                    }}
                    data-testid="tag-collab-add-time"
                    title="Ajouter une durée sans chrono (ex. 45 ou 1h30)"
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  >
                    ＋ Heure
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
