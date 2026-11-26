// Rappel global : toutes les 15 min pendant qu UN chrono tourne (tache ou
// temps interne), notification PC + toast in-app, meme si l utilisateur change
// de page. Persiste tant que OrgLayout est monte.
import { useState, useEffect, useRef } from 'react';
import { orgApi } from '../lib/orgApi';
import { useTimerReminder } from '../lib/useTimerReminder';

function labelForTask(t: any): string {
  return t?.task_label || t?.label || (t?.task_id ? `Tâche ${t.task_id}` : 'Chrono tâche');
}
function labelForInternal(t: any): string {
  return t?.category ? `Temps interne — ${t.category}` : 'Temps interne';
}

export default function GlobalTimerReminder() {
  const [taskLabel, setTaskLabel] = useState<string | null>(null);
  const [internalLabel, setInternalLabel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Poll des chronos actifs toutes les 30 s (le backend peut les arreter
  // automatiquement pour plafond/18:00).
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const r = await orgApi.getMyTimers();
        const timers = r.timers || [];
        const t = timers[0] || null;
        setTaskLabel(t ? labelForTask(t) : null);
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

  // Rappel 15 min pour le chrono tache actif (s'il y en a un).
  const taskToast = useTimerReminder(taskLabel);
  // Rappel 15 min pour le chrono interne actif.
  const internalToast = useTimerReminder(internalLabel);

  useEffect(() => {
    const msg = taskToast || internalToast;
    if (msg) setToast(msg);
  }, [taskToast, internalToast]);

  if (!toast) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-xl shadow-lg px-4 py-3"
      data-testid="global-timer-reminder-toast"
    >
      {toast}
      <button
        onClick={() => setToast(null)}
        className="ml-2 text-amber-600 hover:text-amber-800 font-bold"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
