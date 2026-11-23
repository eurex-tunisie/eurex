import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orgApi } from '../../lib/orgApi';
import { fmtH } from './OrgReport';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function OrgTimesheet() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    orgApi.getMyTimesheet(date)
      .then(r => { if (alive) setData(r); })
      .catch(e => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [date]);

  const shiftWeek = (delta: number) => {
    const d = new Date((data?.monday || date) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setDate(d.toISOString().slice(0, 10));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  const days = data?.days || [];
  const totalWeek = days.reduce((s: number, d: any) => s + (d.total_seconds || 0), 0);

  return (
    <div data-testid="timesheet-page" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">📅 Feuille de temps hebdomadaire</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="btn btn-outline px-2.5 py-1.5 rounded-lg text-sm font-semibold">‹</button>
          <span className="text-sm font-semibold text-gray-700">{data?.monday} → {data?.sunday}</span>
          <button onClick={() => shiftWeek(1)} className="btn btn-outline px-2.5 py-1.5 rounded-lg text-sm font-semibold">›</button>
          <button onClick={() => setDate(new Date().toISOString().slice(0, 10))} className="btn btn-outline px-2.5 py-1.5 rounded-lg text-sm font-semibold">Cette semaine</button>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="card overflow-hidden shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="py-2 px-3 text-left font-medium">Tâche / Catégorie</th>
              {days.map((d: any, i: number) => (
                <th key={d.date} className="py-2 px-2 text-center font-medium">{DAY_LABELS[i]}<br /><span className="text-[9px] text-gray-400">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span></th>
              ))}
              <th className="py-2 px-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* Collect unique tasks across the week */}
            {(() => {
              const taskMap = new Map<string, { label: string; dossier_id: string; client_name: string; days: number[] }>();
              days.forEach((d: any, di: number) => {
                for (const t of (d.tasks || [])) {
                  const key = t.task_id || t.task_label;
                  if (!taskMap.has(key)) taskMap.set(key, { label: t.task_label, dossier_id: t.dossier_id, client_name: t.client_name, days: Array(7).fill(0) });
                  taskMap.get(key)!.days[di] += t.seconds || 0;
                }
              });
              const rows = Array.from(taskMap.entries());
              if (rows.length === 0) return (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">Aucune heure pointée cette semaine.</td></tr>
              );
              return rows.map(([key, info]) => {
                const rowTotal = info.days.reduce((s, v) => s + v, 0);
                return (
                  <tr key={key} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="py-2 px-3">
                      <div className="font-medium text-gray-800 truncate max-w-[220px]" title={info.label}>{info.label}</div>
                      {info.client_name && <div className="text-[10px] text-gray-400 truncate">{info.client_name}</div>}
                    </td>
                    {info.days.map((sec: number, di: number) => (
                      <td key={di} className="py-2 px-2 text-center text-gray-700 font-mono text-[11px]">
                        {sec > 0 ? fmtH(sec) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-gray-900 font-mono">{fmtH(rowTotal)}</td>
                  </tr>
                );
              });
            })()}
            {/* Internal time rows */}
            {(() => {
              const catMap = new Map<string, number[]>();
              days.forEach((d: any, di: number) => {
                for (const c of (d.internal || [])) {
                  if (!catMap.has(c.category)) catMap.set(c.category, Array(7).fill(0));
                  catMap.get(c.category)![di] += c.seconds || 0;
                }
              });
              if (catMap.size === 0) return null;
              return Array.from(catMap.entries()).map(([cat, arr]) => {
                const rowTotal = arr.reduce((s, v) => s + v, 0);
                return (
                  <tr key={'int-' + cat} className="border-t border-gray-100 bg-purple-50/30">
                    <td className="py-2 px-3">
                      <div className="font-medium text-purple-700 truncate max-w-[220px]">Temps interne — {cat}</div>
                    </td>
                    {arr.map((sec: number, di: number) => (
                      <td key={di} className="py-2 px-2 text-center text-purple-600 font-mono text-[11px]">
                        {sec > 0 ? fmtH(sec) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-purple-700 font-mono">{fmtH(rowTotal)}</td>
                  </tr>
                );
              });
            })()}
            {/* Total row */}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <td className="py-2 px-3 text-gray-700">Total</td>
              {days.map((d: any) => (
                <td key={d.date} className="py-2 px-2 text-center text-gray-900 font-mono text-[11px]">{fmtH(d.total_seconds)}</td>
              ))}
              <td className="py-2 px-3 text-right text-gray-900 font-mono">{fmtH(totalWeek)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}