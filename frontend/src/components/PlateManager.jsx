import { useState } from 'react';
import { Check, CreditCard, Plus, Star, Trash2 } from 'lucide-react';
import { isValidPlate, normalizePlate } from '../services/authService.js';

export default function PlateManager({ plates = [], activePlate, onSelect, onChange, disabled }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const plate = normalizePlate(draft);
    if (!isValidPlate(plate)) { setError('Enter a valid plate.'); return; }
    if (plates.includes(plate)) { setError('Already added.'); return; }
    setError('');
    setDraft('');
    onChange([...plates, plate]);
    if (!activePlate) onSelect(plate);
  };

  const remove = (plate) => {
    const next = plates.filter((p) => p !== plate);
    onChange(next);
    if (plate === activePlate) onSelect(next[0] ?? '');
  };

  return (
    <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-900">
          <CreditCard size={13} style={{ color: 'var(--lo-primary)' }} /> Plate Numbers
        </h3>
        <span className="text-[10px] font-semibold text-slate-500">
          {plates.length} {plates.length === 1 ? 'unit' : 'units'}
        </span>
      </header>

      {plates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
          Add your plate number below.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {plates.map((plate) => {
            const active = plate === activePlate;
            return (
              <li
                key={plate}
                className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${
                  active
                    ? 'border-[var(--lo-primary)]/60 bg-slate-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(plate)}
                  disabled={disabled}
                  className="flex min-w-0 items-center gap-2 text-left disabled:opacity-60"
                >
                  {active ? <Check size={13} className="shrink-0 text-blue-600" /> : <Star size={13} className="shrink-0 text-slate-500" />}
                  <span className="truncate font-mono text-xs font-bold tracking-widest text-slate-900">{plate}</span>
                </button>
                <span className="flex shrink-0 items-center gap-1.5">
                  {active ? (
                    <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-900">on air</span>
                  ) : (
                    <button type="button" onClick={() => onSelect(plate)} disabled={disabled} className="rounded-lg border border-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-900 transition hover:border-[var(--lo-primary)]/40 hover:text-blue-600 disabled:opacity-50">
                      use
                    </button>
                  )}
                  <button type="button" onClick={() => remove(plate)} disabled={disabled} aria-label={`Remove ${plate}`} className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-50 hover:text-red-500 disabled:opacity-40">
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => { setDraft(normalizePlate(e.target.value)); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          disabled={disabled}
          placeholder="BMS 1930"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs uppercase tracking-widest text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/25 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {error && <p className="text-[10px] font-semibold text-slate-900">{error}</p>}
      {disabled && <p className="text-[10px] text-slate-500">End trip to change plates.</p>}
    </section>
  );
}
