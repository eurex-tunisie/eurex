// Rappel toutes les 15 min pendant qu'un chrono tourne, pour eviter qu'un
// utilisateur oublie de l'arreter (gonflement des heures).
// Utilise l'API Notification du navigateur; repli silencieux si refusee.
import { useEffect, useRef } from 'react';

const INTERVAL_MS = 15 * 60 * 1000;

export function useTimerReminder(label: string | null) {
  const labelRef = useRef<string | null>(label);
  labelRef.current = label;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!label) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    // Demande la permission une fois (sans bloquer).
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { /* ignore */ });
    }
    const fire = () => {
      const cur = labelRef.current;
      if (!cur) return;
      const title = '⏱ Chrono toujours en cours';
      const body = `${cur} — tu travailles toujours dessus ? Clique pour ouvrir.`;
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = new Notification(title, { body, tag: 'eurex-timer-reminder' });
          n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
        }
      } catch { /* ignore */ }
    };
    timerRef.current = setInterval(fire, INTERVAL_MS);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [label]);
}
