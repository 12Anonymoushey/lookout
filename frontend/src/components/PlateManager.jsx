import { useState } from 'react';
import { Check, CreditCard, Plus, Star, Trash2 } from 'lucide-react';
import { isValidPlate, normalizePlate } from '../services/authService.js';

/**
 * PLATE MANAGER (driver only)
 * Drivers may own several units, so plates live in their Firestore profile:
 *   plates: ['BMS 1930', 'UGS 2403'],  activePlate: 'BMS 1930'
 * The active plate is the vehicle body number broadcast on the map.
 */
export default function PlateManager({ plates = [], activePlate, onSelect, onChange, disabled }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const plate = normalizePlate(draft);
    if (!isValidPlate(plate)) {
      setError('Use 3–12 letters/numbers, e.g. BMS 1930.');
      return;
    }
    if (plates.includes(plate)) {
      setError('That plate is already on your list.');
      return;
    }
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
    <section className="space-y-2.5 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-3.5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-300">
          <CreditCard size={13} className="text-cyan-400" /> My plate numbers
        </h3>
        <span className="text-[10px] font-semibold text-slate-500">
          {plates.length} {plates.length === 1 ? 'unit' : 'units'}
        </span>
      </header>

      {plates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 px-3 py-2 text-[11px] text-slate-400">
          No plates yet — add the body number painted on your unit below.
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
                    ? 'border-cyan-400/60 bg-cyan-500/10'
                    : 'border-slate-700/60 bg-slate-900/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(plate)}
                  disabled={disabled}
                  className="flex min-w-0 items-center gap-2 text-left disabled:opacity-60"
                >
                  {active ? (
                    <Check size={13} className="shrink-0 text-cyan-300" />
                  ) : (
                    <Star size={13} className="shrink-0 text-slate-500" />
                  )}
                  <span className="truncate font-mono text-xs font-bold tracking-widest text-slate-100">
                    {plate}
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-1.5">
                  {active ? (
                    <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-200">
                      on air
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(plate)}
                      disabled={disabled}
                      className="rounded-lg border border-slate-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                    >
                      use
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(plate)}
                    disabled={disabled}
                    aria-label={`Remove ${plate}`}
                    className="rounded-lg p-1 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"
                  >
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
          onChange={(e) => {
            setDraft(normalizePlate(e.target.value));
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          disabled={disabled}
          placeholder="BMS 1930"
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-xs uppercase tracking-widest text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {error && <p className="text-[10px] font-semibold text-rose-300">{error}</p>}
      {disabled && (
        <p className="text-[10px] text-slate-500">End your trip to change your plates.</p>
      )}
    </section>
  );
}
