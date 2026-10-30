import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Hand, Inbox, MapPin, X } from 'lucide-react';
import { subscribeDriverPokes, timeAgo } from '../services/pokeService.js';

export default function DriverPokes({ plate, className = '', open: openProp, onOpenChange }) {
  const [state, setState] = useState({ count: 0, list: [], source: 'socket' });
  const [localOpen, setLocalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : localOpen;
  const setOpen = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (!controlled) setLocalOpen(value);
    onOpenChange?.(value);
  };
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

  useEffect(() => {
    if (!open) return undefined;
    const lockBody = window.matchMedia('(max-width: 639px)').matches;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (lockBody) document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      if (lockBody) document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!plate) return null;

  return (
    <div className={`relative ${className}`}>
      {open && (
        <>
        <button type="button" aria-label="Close pokes" onClick={() => setOpen(false)} className="fixed inset-0 z-[1600] bg-slate-900/35 sm:hidden" />
        <section role="dialog" aria-label={`Pokes for ${plate}`} className="fixed inset-x-0 bottom-0 z-[1800] max-h-[75dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:z-50 sm:mb-2 sm:max-h-[24rem] sm:w-80 sm:rounded-2xl sm:pb-0">
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Inbox size={13} style={{ color: 'var(--lo-primary)' }} /> Pokes for {plate}
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-slate-900" style={{ background: 'var(--lo-success)' }}>{state.count}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close pokes" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50 sm:hidden"><X size={18} /></button>
            </div>
          </header>
          {state.list.length === 0 ? (
            <p className="px-3 py-5 text-center text-[11px] text-slate-500">No pokes yet.</p>
          ) : (
            <ul className="max-h-[55dvh] divide-y divide-[var(--lo-panel-border)] overflow-y-auto sm:max-h-72">
              {state.list.map((poke) => (
                <li key={poke.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--lo-success)', color: 'var(--lo-text)' }}>
                    <Hand size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-slate-900">{poke.fromName || 'A commuter'}</p>
                    <p className="text-[11px] text-slate-900">{poke.message || 'Poke! 👋'}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
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
          <p className="border-t border-slate-200 px-3 py-1.5 text-[9px] uppercase tracking-widest text-slate-500">
            {state.source === 'firestore' ? 'Firestore' : 'Realtime server'}
          </p>
        </section>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-xs font-bold shadow-xl backdrop-blur transition ${
          bump
            ? 'border-[var(--lo-success)] bg-[var(--lo-success)] text-slate-900'
            : 'border-slate-200 bg-white text-slate-900 hover:border-[var(--lo-primary)]/40 hover:text-blue-600'
        }`}
      >
        <Hand size={14} className={bump ? 'animate-bounce' : ''} style={{ color: 'var(--lo-success)' }} />
        <span className="tabular-nums">{state.count} Pokes</span>
        <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}
