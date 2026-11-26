// Rappel toutes les 15 min pendant qu'un chrono tourne, pour eviter qu'un
// utilisateur oublie de l'arreter (gonflement des heures).
// Utilise l'API Notification du navigateur; repli sur un toast in-app si
// la permission est refusee ou indisponible.
import { useEffect, useRef, useState } from 'react';

const INTERVAL_MS = 15 * 60 * 1000;

export function useTimerReminder(label: string | null) {
  const labelRef = useRef<string | null>(label);
  labelRef.current = label;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!label) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setToast(null);
      return;
    }

    // Demande la permission au demarrage du chrono (dans le geste utilisateur).
    const ensurePermission = async () => {
      if (typeof Notification === 'undefined') return 'denied';
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      try {
        const res = await Notification.requestPermission();
        return res;
      } catch {
        return 'denied';
      }
    };

    const fire = async () => {
      const cur = labelRef.current;
      if (!cur) return;
      const title = '⏱ Chrono toujours en cours';
      const body = `${cur} — tu travailles toujours dessus ? Clique pour ouvrir.`;
      const perm = await ensurePermission();
      if (perm === 'granted') {
        try {
          const n = new Notification(title, { body, tag: 'eurex-timer-reminder' });
          n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
          // Auto-fermeture apres 8 s.
          setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 8000);
        } catch {
          setToast(body);
        }
      } else {
        // Repli in-app si la notification systeme est refusee.
        setToast(body);
        setTimeout(() => setToast(null), 8000);
      }
    };

    // Premier rappel apres 15 min, puis toutes les 15 min.
    timerRef.current = setInterval(fire, INTERVAL_MS);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [label]);

  // Toast in-app de repli (rendu par le composant parent via ce hook).
  if (toast) {
    // Rendu inline minimaliste.
  }
  return toast;
}
