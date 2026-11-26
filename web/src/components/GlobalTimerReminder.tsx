// Rappel global : toutes les 15 min pendant qu UN chrono tourne (tache ou
// temps interne), notification PC + toast in-app, meme si l utilisateur change
// de page. Persiste tant que OrgLayout est monte.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { orgApi } from '../lib/orgApi';
import { useTimerReminder } from '../lib/useTimerReminder';

function labelForTask(t: any): string {
  return t?.task_label || t?.label || (t?.task_id ? `Tâche ${t.task_id}` : 'Chrono tâche');
}
function labelForInternal(t: any): string {
  return t?.category ? `Temps interne — ${t.category}` : 'Temps interne';
}

export default function GlobalTimerReminder() {
  const navigate = useNavigate();
  const [taskLabel, setTaskLabel] = useState<string | null>(null);
  const [internalLabel, setInternalLabel] = useState<string | null>(null);
  const [taskTarget, setTaskTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const r = await orgApi.getMyTimers();
        const timers = r.timers || [];
        const t = timers[0] || null;
        setTaskLabel(t ? labelForTask(t) : null);
        setTaskTarget(t?.dossier_id ? `/cabinet/dossier/${t.dossier_id}?task=${t.task_id || ''}` : null);
      } catch { /* ignore */ }
      try {
        const r = await orgApi.getActiveInternalTimers();
        const timers = r.timers || [];
        const t = timers[0] || null;
        setInternalLabel(t ? labelForInternal(t) : null);
      } catch { /* ignore */ }
    };
    refresh();
    const iv = setInterval(() => { if (!document.hidden && alive) refresh(); }, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const openTask = () => { if (taskTarget) navigate(taskTarget); };
  const openInternal = () => { navigate('/cabinet'); };

  const taskToast = useTimerReminder(taskLabel, openTask);
  const internalToast = useTimerReminder(internalLabel, openInternal);

  useEffect(() => {
    const msg = taskToast || internalToast;
    if (msg) setToast(msg);
  }, [taskToast, internalToast]);

  if (!toast) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-xl shadow-lg px-4 py-3 cursor-pointer"
      data-testid="global-timer-reminder-toast"
      onClick={() => {
        if (taskTarget) navigate(taskTarget);
        setToast(null);
      }}
    >
      {toast}
      <button
        onClick={(e) => { e.stopPropagation(); setToast(null); }}
        className="ml-2 text-amber-600 hover:text-amber-800 font-bold"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
