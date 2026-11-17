import { useState, useEffect, useRef } from 'react';
import { Clock, Play, Square, Plus, X, Trash2 } from 'lucide-react';
import { orgApi } from '../lib/orgApi';

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
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (t) setElapsed(Math.max(0, Math.floor(Date.now() / 1000) - parseUtc(t.started_at)));
      else setElapsed(0);
    } catch { /* ignore */ }
  };
  const refresh = async () => { await Promise.all([refreshCats(), refreshActive()]); };

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
          <Clock size={14} /> Temps interne (réunion, informatique, …)
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(v => !v)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
            data-testid="ti-add-toggle"
          >
            {showAdd ? <><X size={12} /> Fermer</> : <><Plus size={12} /> Ajouter une catégorie</>}
          </button>
          <button
            onClick={() => setShowManual(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
            data-testid="ti-manual-toggle"
          >
            {showManual ? <><X size={12} /> Fermer</> : <><Plus size={12} /> Saisie manuelle</>}
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
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
            <div key={cat.code} className="flex items-center gap-1">
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
                {isRunning && <span className="font-mono text-xs">· {fmtHm(elapsed)}</span>}
              </button>
              {cat.deletable && (
                <button
                  onClick={() => removeCategory(cat.code)}
                  disabled={busy}
                  title="Supprimer cette catégorie"
                  data-testid={`ti-del-${cat.code}`}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
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
