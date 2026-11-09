import { useEffect, useRef, useState } from 'react';
import { E7TIFEL_VIDEOS, e7tifelPickIndex } from '../lib/e7tifel';

// Animation « e7tifel » : UNE vidéo au hasard (public/e7tifel/v1…vN.mp4)
// jouée en plein écran quand une tâche est terminée dans les temps.
// Fermeture : bouton, clic hors vidéo, Échap, ou fin de la vidéo.
export default function E7tifel({ onClose }: { onClose: () => void }) {
  // Choix au hasard, figé au montage (1 seule vidéo par célébration)
  const [n] = useState(() => e7tifelPickIndex());
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Autoplay : tentative avec son, repli silencieux si le navigateur refuse
    const v = videoRef.current;
    if (v) {
      v.play().catch(() => {
        if (v) { v.muted = true; v.play().catch(() => setFailed(true)); }
      });
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const src = `${import.meta.env.BASE_URL}e7tifel/v${n}.mp4`;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 p-4"
      style={{ background: 'rgba(0, 0, 0, 0.88)' }}
      onClick={onClose}
      data-testid="e7tifel-overlay"
      role="dialog"
      aria-label="e7tifel"
    >
      <p className="text-white text-lg font-bold text-center drop-shadow">
        🎉 e7tifel ! Terminé dans les temps 🎉
      </p>
      {!failed ? (
        <video
          ref={videoRef}
          src={src}
          autoPlay
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
          onEnded={onClose}
          onClick={e => e.stopPropagation()}
          className="max-w-full max-h-[70vh] rounded-xl shadow-2xl bg-black"
          data-testid="e7tifel-video"
        />
      ) : (
        <p className="text-white/80 text-sm" data-testid="e7tifel-fallback">
          🎬 ({E7TIFEL_VIDEOS} vidéos disponibles, lecture impossible ici)
        </p>
      )}
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        className="px-5 py-2 rounded-lg text-sm font-semibold bg-white text-gray-800 hover:bg-gray-100"
        data-testid="e7tifel-close"
      >
        ✕ Fermer
      </button>
    </div>
  );
}
