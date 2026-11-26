import { useState, useEffect, useRef } from 'react';
import { Clock, Play, Square, Plus, X, Trash2 } from 'lucide-react';
import { orgApi } from '../lib/orgApi';
import { useTimerReminder } from '../lib/useTimerReminder';

type Cat = { code: string; label: string; deletable: boolean };

function parseUtc(s: string): number {
  return Math.floor(Date.parse(String(s).replace(' ', 'T') + 'Z') / 1000);
}
function fmtHm(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export default function TempsInterne() {
  const [categories, setCategories] = useState<Cat[]>([]);
  const [active, setActive] = useState<{ id: string; category: string; started_at: string; note: string | null } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [mCat, setMCat] = useState('');
  const [mMins, setMMins] = useState('');
  const [mNote, setMNote] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [err, setErr] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [guard, setGuard] = useState<{ day_seconds: number; norm_day_seconds: number; cap_seconds: number | null; remaining_seconds: number | null; tolerance_seconds: number } | null>(null);
  const [justStopped, setJustStopped] = useState(false);
  useTimerReminder(active ? (categories.find(c => c.code === active.category)?.label || active.category) : null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitHitRef = useRef(false);

  const refreshCats = async () => {
    try {
      const r = await orgApi.getInternalTimeCategories();
      setCategories(r.categories || []);
      if (!mCat && (r.categories || []).length) setMCat((r.categories || [])[0].code);
    } catch { /* ignore */ }
  };
  const refreshActive = async () => {
    try {
      const r = await orgApi.getActiveInternalTimers();
      const t = (r.timers || [])[0] || null;
      setActive(t);
      setGuard({ day_seconds: r.day_seconds || 0, norm_day_seconds: r.norm_day_seconds || 0, cap_seconds: r.cap_seconds ?? null, remaining_seconds: r.remaining_seconds ?? null, tolerance_seconds: r.tolerance_seconds || 1800 });
      setJustStopped(!!r.just_stopped);
      if (t) setElapsed(Math.max(0, Math.floor(Date.now() / 1000) - parseUtc(t.started_at)));
      else setElapsed(0);
    } catch { /* ignore */ }
  };
  const refresh = async () => { await Promise.all([refreshCats(), refreshActive()]); };

  useEffect(() => { refresh(); }, []);
  // Ferme le menu + si on clique ailleurs.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-testid="ti-menu-toggle"], [data-testid="ti-menu"]');
      if (!el) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);
  // Poll : le serveur peut avoir arrete le chrono (plafond ou 18:00).
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) refreshActive(); }, 60000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (active) {
      tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [active?.id]);

  // Plafond du jour : le compteur affiche ne depasse jamais le reste
  // disponible, et une fois la limite atteinte on redemande l'etat au serveur
  // (qui arrete le chrono).
  const remaining = guard?.remaining_seconds;
  const cappedElapsed = (active && remaining != null) ? Math.min(elapsed, remaining) : elapsed;
  const atLimit = !!active && remaining != null && elapsed >= remaining;
  useEffect(() => {
    if (!active || remaining == null) { limitHitRef.current = false; return; }
    if (elapsed >= remaining && !limitHitRef.current) {
      limitHitRef.current = true;
      refreshActive();
    }
  }, [elapsed, active?.id, remaining]);

  const labelOf = (code: string) => categories.find(c => c.code === code)?.label || code;

  const start = async (cat: string) => {
    setBusy(true); setErr('');
    try { await orgApi.startInternalTime(cat as any); await refreshActive(); }
    catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };
  const stop = async (cat?: string) => {
    setBusy(true); setErr('');
    try { await orgApi.stopInternalTime(cat as any); await refreshActive(); }
    catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };
  const submitManual = async () => {
    const mins = Number(mMins);
    if (!Number.isFinite(mins) || mins <= 0) { setErr('Durée invalide'); return; }
    if (!mCat) { setErr('Catégorie requise'); return; }
    setMBusy(true); setErr('');
    try {
      await orgApi.manualInternalTime(mCat as any, Math.round(mins * 60), mNote || undefined);
      setMNote(''); setMMins(''); setShowManual(false);
    } catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setMBusy(false); }
  };
  const addCategory = async () => {
    const label = newLabel.trim();
    if (label.length < 2) { setErr('Libellé trop court'); return; }
    setAddBusy(true); setErr('');
    try {
      const r = await orgApi.createInternalTimeCategory(label);
      setNewLabel(''); setShowAdd(false);
      await refreshCats();
      if (r.code) setMCat(r.code);
    } catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setAddBusy(false); }
  };
  const removeCategory = async (code: string) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    setBusy(true); setErr('');
    try { await orgApi.deleteInternalTimeCategory(code); await refreshCats(); }
    catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card rounded-2xl p-4" data-testid="temps-interne">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Clock size={14} /> Temps interne
        </h3>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-purple-600 hover:bg-purple-50 border border-gray-200 hover:border-purple-300 transition-colors"
            data-testid="ti-menu-toggle"
            title="Plus d'options"
          >
            {menuOpen ? <X size={14} /> : <Plus size={14} />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48" data-testid="ti-menu">
              <button
                onClick={() => { setShowAdd(v => !v); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-1.5"
                data-testid="ti-add-toggle"
              >
                <Plus size={12} /> Ajouter une catégorie
              </button>
              <button
                onClick={() => { setShowManual(v => !v); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-1.5"
                data-testid="ti-manual-toggle"
              >
                <Plus size={12} /> Saisie manuelle
              </button>
            </div>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
      {justStopped && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5 mb-2" data-testid="ti-limit-stopped">
          Limite du jour atteinte : le chrono a été arrêté automatiquement.
        </p>
      )}
      {atLimit && !justStopped && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2" data-testid="ti-limit-warn">
          Plafond du jour atteint (norme + 30 mn) — le chrono va s'arrêter.
        </p>
      )}
      {guard?.cap_seconds != null && (() => {
        const used = guard.day_seconds + (active ? cappedElapsed : 0);
        const rest = Math.max(0, guard.cap_seconds - used);
        const pct = Math.min(100, Math.round((used / Math.max(1, guard.cap_seconds)) * 100));
        const bar = pct >= 100 ? 'bg-rose-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500';
        return (
          <div className="mb-3" data-testid="ti-day-guard">
            <div className="flex items-baseline justify-between text-[11px] text-gray-500 mb-1">
              <span className="font-semibold text-gray-600">
                {fmtHm(used)} <span className="font-normal text-gray-400">/ {fmtHm(guard.cap_seconds)}</span>
                <span className="text-gray-400"> · reste {fmtHm(rest)}</span>
              </span>
              <span className="text-[10px] text-gray-400">arrêt auto à 18:00</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}
      {showAdd && (
        <div className="mb-3 flex items-end gap-2">
          <div className="flex flex-col flex-1">
            <label className="text-[10px] text-gray-500 mb-0.5">Libellé de la catégorie</label>
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="input-sm px-2 py-1.5 text-sm"
              data-testid="ti-new-label"
              placeholder="ex. Formation, Déplacement…"
            />
          </div>
          <button
            onClick={addCategory}
            disabled={addBusy}
            className="btn btn-primary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            data-testid="ti-add-submit"
          >
            {addBusy ? '…' : 'Créer'}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const isRunning = active?.category === cat.code;
          return (
            <div key={cat.code} className="group flex items-center gap-1">
              <button
                disabled={busy}
                onClick={() => (isRunning ? stop(cat.code) : start(cat.code))}
                data-testid={`ti-${cat.code}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  isRunning
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {isRunning ? <Square size={13} /> : <Play size={13} />}
                {cat.label}
                {isRunning && (
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {fmtHm(cappedElapsed)}
                  </span>
                )}
              </button>
              {cat.deletable && (
                <button
                  onClick={() => removeCategory(cat.code)}
                  disabled={busy}
                  title="Supprimer cette catégorie"
                  data-testid={`ti-del-${cat.code}`}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {showManual && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-500 mb-0.5">Catégorie</label>
            <select
              value={mCat}
              onChange={e => setMCat(e.target.value)}
              className="input-sm px-2 py-1.5 text-sm"
              data-testid="ti-manual-cat"
            >
              {categories.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-500 mb-0.5">Minutes</label>
            <input
              type="number"
              min={1}
              value={mMins}
              onChange={e => setMMins(e.target.value)}
              className="input-sm px-2 py-1.5 text-sm w-20"
              data-testid="ti-manual-mins"
            />
          </div>
          <div className="flex flex-col flex-1 min-w-[120px]">
            <label className="text-[10px] text-gray-500 mb-0.5">Note (optionnel)</label>
            <input
              type="text"
              value={mNote}
              onChange={e => setMNote(e.target.value)}
              className="input-sm px-2 py-1.5 text-sm"
              data-testid="ti-manual-note"
            />
          </div>
          <button
            onClick={submitManual}
            disabled={mBusy}
            className="btn btn-primary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            data-testid="ti-manual-submit"
          >
            {mBusy ? '…' : 'Ajouter'}
          </button>
        </div>
      )}
      {active && (
        <p className="text-[11px] text-amber-700 mt-2">
          {labelOf(active.category)} en cours depuis {fmtHm(elapsed)}
          {active.note ? ` — ${active.note}` : ''}
        </p>
      )}
    </div>
  );
}
