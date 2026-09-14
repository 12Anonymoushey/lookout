import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Hand, Inbox, MapPin } from 'lucide-react';
import { subscribeDriverPokes, timeAgo } from '../services/pokeService.js';

export default function DriverPokes({ plate, className = '' }) {
  const [state, setState] = useState({ count: 0, list: [], source: 'socket' });
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const previous = useRef(0);
  const bumpTimer = useRef(null);

  useEffect(() => {
    if (!plate) return undefined;
    previous.current = 0;
    setState({ count: 0, list: [], source: 'socket' });
    const unsubscribe = subscribeDriverPokes(plate, (next) => {
      setState(next);
      if (next.count > previous.current) {
        setBump(true);
        clearTimeout(bumpTimer.current);
        bumpTimer.current = setTimeout(() => setBump(false), 900);
      }
      previous.current = next.count;
    });
    return () => { clearTimeout(bumpTimer.current); unsubscribe(); };
  }, [plate]);

  if (!plate) return null;

  return (
    <div className={`relative ${className}`}>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-panel)]/95 shadow-2xl backdrop-blur">
          <header className="flex items-center justify-between gap-2 border-b border-[var(--lo-panel-border)] px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--lo-text)]">
              <Inbox size={13} style={{ color: 'var(--lo-pink)' }} /> Pokes for {plate}
            </p>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--lo-cyan)', color: 'var(--lo-text)' }}>
              {state.count}
            </span>
          </header>
          {state.list.length === 0 ? (
            <p className="px-3 py-5 text-center text-[11px] text-[var(--lo-text-secondary)]">No pokes yet.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-[var(--lo-panel-border)] overflow-y-auto">
              {state.list.map((poke) => (
                <li key={poke.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--lo-cyan)', color: 'var(--lo-text)' }}>
                    <Hand size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-[var(--lo-text)]">{poke.fromName || 'A commuter'}</p>
                    <p className="text-[11px] text-[var(--lo-text)]">{poke.message || 'Poke! 👋'}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--lo-text-secondary)]">
                      {timeAgo(poke.createdAt)}
                      {Number.isFinite(Number(poke.lat)) && Number.isFinite(Number(poke.lng)) && (
                        <><MapPin size={9} /> {Number(poke.lat).toFixed(4)}</>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-[var(--lo-panel-border)] px-3 py-1.5 text-[9px] uppercase tracking-widest text-[var(--lo-text-secondary)]">
            {state.source === 'firestore' ? 'Firestore' : 'Realtime server'}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur transition ${
          bump
            ? 'border-[var(--lo-pink)] bg-[var(--lo-pink)]/25 text-[var(--lo-pink)]'
            : 'border-[var(--lo-card-border)] bg-[var(--lo-panel)]/90 text-[var(--lo-text)] hover:border-[var(--lo-pink)]/40 hover:text-[var(--lo-pink)]'
        }`}
      >
        <Hand size={14} className={bump ? 'animate-bounce' : ''} style={{ color: bump ? 'var(--lo-pink)' : 'var(--lo-sky)' }} />
        <span className="tabular-nums">{state.count} Pokes</span>
        <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}
