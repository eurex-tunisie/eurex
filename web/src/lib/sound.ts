// Effets sonores synthétisés (Web Audio) — pas de fichier externe à embarquer.
// Préférence « muet » stockée dans localStorage (eurex_sound_muted).
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem('eurex_sound_muted') === '1') return null;
  if (!ctx) {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  // Reprendre le contexte si le navigateur l'a suspendu (autoplay policy)
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, start = 0) {
  const c = audioCtx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function isMuted(): boolean {
  return localStorage.getItem('eurex_sound_muted') === '1';
}
export function setMuted(v: boolean) {
  localStorage.setItem('eurex_sound_muted', v ? '1' : '0');
}
export function toggleMuted(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

// Cloche / notification (ping aigu court)
export function playNotify() {
  tone(880, 0.12, 'sine', 0.15);
  tone(1320, 0.18, 'sine', 0.12, 0.08);
}
// Succès / célébration (accord montant)
export function playSuccess() {
  tone(523.25, 0.12, 'triangle', 0.16);
  tone(659.25, 0.14, 'triangle', 0.16, 0.10);
  tone(783.99, 0.18, 'triangle', 0.16, 0.20);
  tone(1046.5, 0.22, 'triangle', 0.14, 0.32);
}
// Action (clic doux)
export function playAction() {
  tone(660, 0.07, 'sine', 0.10);
}
// Erreur (ton grave)
export function playError() {
  tone(220, 0.18, 'sawtooth', 0.12);
  tone(196, 0.22, 'sawtooth', 0.10, 0.12);
}
// Déblocage (deux notes ascendantes)
export function playUnblock() {
  tone(440, 0.08, 'sine', 0.12);
  tone(660, 0.12, 'sine', 0.12, 0.08);
}