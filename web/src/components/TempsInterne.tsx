import { useState, useEffect, useRef } from 'react';
import { Clock, Play, Square, Plus, X } from 'lucide-react';
import { orgApi } from '../lib/orgApi';

type Cat = 'reunion' | 'informatique';
const CAT_LABEL: Record<Cat, string> = { reunion: 'Réunion', informatique: 'Informatique' };
const CATS: Cat[] = ['reunion', 'informatique'];

function parseUtc(s: string): number {
  return Math.floor(Date.parse(String(s).replace(' ', 'T') + 'Z') / 1000);
}
function fmtHm(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export default function TempsInterne() {
  const [active, setActive] = useState<{ id: string; category: string; started_at: string; note: string | null } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [mCat, setMCat] = useState<Cat>('reunion');
  const [mMins, setMMins] = useState('');
  const [mNote, setMNote] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [err, setErr] = useState('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const r = await orgApi.getActiveInternalTimers();
      const t = (r.timers || [])[0] || null;
      setActive(t);
      if (t) setElapsed(Math.max(0, Math.floor(Date.now() / 1000) - parseUtc(t.started_at)));
      else setElapsed(0);
    } catch { /* ignore */ }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (active) {
      tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [active?.id]);

  const start = async (cat: Cat) => {
    setBusy(true); setErr('');
    try { await orgApi.startInternalTime(cat); await refresh(); }
    catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };
  const stop = async (cat?: Cat) => {
    setBusy(true); setErr('');
    try { await orgApi.stopInternalTime(cat); await refresh(); }
    catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };
  const submitManual = async () => {
    const mins = Number(mMins);
    if (!Number.isFinite(mins) || mins <= 0) { setErr('Durée invalide'); return; }
    setMBusy(true); setErr('');
    try {
      await orgApi.manualInternalTime(mCat, Math.round(mins * 60), mNote || undefined);
      setMNote(''); setMMins(''); setShowManual(false);
    } catch (e: any) { setErr(e.message || 'Erreur'); }
    finally { setMBusy(false); }
  };

  return (
    <div className="card rounded-2xl p-4" data-testid="temps-interne">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Clock size={14} /> Temps interne (réunion, informatique)
        </h3>
        <button
          onClick={() => setShowManual(v => !v)}
          className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
          data-testid="ti-manual-toggle"
        >
          {showManual ? <><X size={12} /> Fermer</> : <><Plus size={12} /> Saisie manuelle</>}
        </button>
      </div>
      {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {CATS.map(cat => {
          const isRunning = active?.category === cat;
          return (
            <button
              key={cat}
              disabled={busy}
              onClick={() => (isRunning ? stop(cat) : start(cat))}
              data-testid={`ti-${cat}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                isRunning
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isRunning ? <Square size={13} /> : <Play size={13} />}
              {CAT_LABEL[cat]}
              {isRunning && <span className="font-mono text-xs">· {fmtHm(elapsed)}</span>}
            </button>
          );
        })}
      </div>
      {active && active.category && !CATS.includes(active.category as Cat) && null}
      {showManual && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-500 mb-0.5">Catégorie</label>
            <select
              value={mCat}
              onChange={e => setMCat(e.target.value as Cat)}
              className="input-sm px-2 py-1.5 text-sm"
              data-testid="ti-manual-cat"
            >
              {CATS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
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
          {CAT_LABEL[active.category as Cat] || active.category} en cours depuis {fmtHm(elapsed)}
          {active.note ? ` — ${active.note}` : ''}
        </p>
      )}
    </div>
  );
}
