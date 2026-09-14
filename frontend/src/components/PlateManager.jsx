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
    <section className="space-y-2.5 rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-card)]/40 p-3.5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#d8c8e8]">
          <CreditCard size={13} style={{ color: 'var(--lo-pink)' }} /> Plate Numbers
        </h3>
        <span className="text-[10px] font-semibold text-[#8a7098]">
          {plates.length} {plates.length === 1 ? 'unit' : 'units'}
        </span>
      </header>

      {plates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--lo-card-border)] px-3 py-2 text-[11px] text-[#8a7098]">
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
                    ? 'border-[var(--lo-pink)]/60 bg-[var(--lo-pink)]/10'
                    : 'border-[var(--lo-card-border)] bg-[#1e1430]/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(plate)}
                  disabled={disabled}
                  className="flex min-w-0 items-center gap-2 text-left disabled:opacity-60"
                >
                  {active ? <Check size={13} className="shrink-0 text-[var(--lo-pink)]" /> : <Star size={13} className="shrink-0 text-[#6a5a7a]" />}
                  <span className="truncate font-mono text-xs font-bold tracking-widest text-[#e0d4ec]">{plate}</span>
                </button>
                <span className="flex shrink-0 items-center gap-1.5">
                  {active ? (
                    <span className="rounded-full bg-[var(--lo-pink)]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--lo-pink)]">on air</span>
                  ) : (
                    <button type="button" onClick={() => onSelect(plate)} disabled={disabled} className="rounded-lg border border-[var(--lo-card-border)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#d8c8e8] transition hover:border-[var(--lo-pink)]/40 hover:text-[var(--lo-pink)] disabled:opacity-50">
                      use
                    </button>
                  )}
                  <button type="button" onClick={() => remove(plate)} disabled={disabled} aria-label={`Remove ${plate}`} className="rounded-lg p-1 text-[#6a5a7a] transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40">
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
          className="min-w-0 flex-1 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 font-mono text-xs uppercase tracking-widest text-[#f0e6f6] placeholder:text-[#6a5a7a] focus:border-[var(--lo-pink)] focus:outline-none focus:ring-2 focus:ring-[#FF69B4]/25 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--lo-pink)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#ff80c0] disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {error && <p className="text-[10px] font-semibold text-rose-300">{error}</p>}
      {disabled && <p className="text-[10px] text-[#8a7098]">End trip to change plates.</p>}
    </section>
  );
}
