import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Hand, Inbox, MapPin } from 'lucide-react';
import { subscribeDriverPokes, timeAgo } from '../services/pokeService.js';

/**
 * DRIVER POKES — the bottom-right counter ("7 Pokes ▾ See Pokes").
 * Subscribes to Firestore when configured, otherwise to the realtime server,
 * so the number ticks up the instant a commuter taps Poke on your jeepney.
 */
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

    return () => {
      clearTimeout(bumpTimer.current);
      unsubscribe();
    };
  }, [plate]);

  if (!plate) return null;

  return (
    <div className={`relative ${className}`}>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-2xl backdrop-blur">
          <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
              <Inbox size={13} className="text-cyan-400" /> Pokes for {plate}
            </p>
            <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
              {state.count} total
            </span>
          </header>

          {state.list.length === 0 ? (
            <p className="px-3 py-5 text-center text-[11px] leading-relaxed text-slate-500">
              No pokes yet. When a commuter taps Poke on your jeepney it shows up here instantly.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-800 overflow-y-auto">
              {state.list.map((poke) => (
                <li key={poke.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300">
                    <Hand size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-slate-100">
                      {poke.fromName || 'A commuter'}
                    </p>
                    <p className="text-[11px] leading-snug text-slate-300">
                      {poke.message || 'Poke! 👋'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                      {timeAgo(poke.createdAt)}
                      {Number.isFinite(Number(poke.lat)) && Number.isFinite(Number(poke.lng)) && (
                        <>
                          {' · '}
                          <MapPin size={9} />
                          {Number(poke.lat).toFixed(4)}, {Number(poke.lng).toFixed(4)}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="border-t border-slate-800 px-3 py-1.5 text-[9px] uppercase tracking-widest text-slate-500">
            {state.source === 'firestore' ? 'Live from Firestore' : 'Live from the realtime server'}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur transition ${
          bump
            ? 'border-cyan-300 bg-cyan-400/25 text-cyan-100'
            : 'border-slate-600/80 bg-slate-900/90 text-slate-200 hover:border-cyan-400 hover:text-cyan-200'
        }`}
      >
        <span className="relative flex items-center">
          <Hand size={14} className={bump ? 'animate-bounce text-cyan-300' : 'text-cyan-400'} />
        </span>
        <span className="tabular-nums">
          {state.count} {state.count === 1 ? 'Poke' : 'Pokes'}
        </span>
        <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
        <span className="sr-only">See pokes</span>
      </button>
    </div>
  );
}
