import { useState } from 'react';
import { Check, CreditCard, Plus, Star, Trash2 } from 'lucide-react';
import { isValidPlate, normalizePlate } from '../services/authService.js';
import { ExpandableListCard } from './KebabMenu.jsx';

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
    <section className="space-y-2.5">
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
        <div className="space-y-1.5">
          {plates.map((plate) => {
            const active = plate === activePlate;
            return (
              <ExpandableListCard
                key={plate}
                leading={active ? <Check size={14} className="mt-0.5 shrink-0 text-blue-600" /> : <Star size={14} className="mt-0.5 shrink-0 text-slate-500" />}
                summary={<><p className="truncate font-mono text-xs font-bold tracking-widest text-slate-900">{plate}</p><p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{active ? 'On air' : 'Saved vehicle'}</p></>}
                details={<p className="text-[10px] text-slate-700">{active ? 'This vehicle is currently selected for your trips.' : 'Select this vehicle before starting a trip.'}</p>}
                actions={disabled ? [] : [
                  ...(!active ? [{ icon: Check, label: 'Use vehicle', onClick: () => onSelect(plate) }] : []),
                  { icon: Trash2, label: 'Remove vehicle', danger: true, onClick: () => remove(plate) },
                ]}
              />
            );
          })}
        </div>
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
          className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white   disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {error && <p className="text-[10px] font-semibold text-slate-900">{error}</p>}
      {disabled && <p className="text-[10px] text-slate-500">End trip to change plates.</p>}
    </section>
  );
}
