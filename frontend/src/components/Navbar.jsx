import { useEffect, useRef, useState } from 'react';
import { Bus, ChevronDown, LogOut, Menu, Radio, ShieldCheck, Users } from 'lucide-react';
import PulseDot from './PulseDot.jsx';

// Only these two are ever shown — the admin console is reached from the account
// menu, so nothing about the admin role leaks onto the login screen or the bar.
const TABS = [
  { id: 'commuter', label: 'Commuter', icon: Users },
  { id: 'driver', label: 'Driver', icon: Bus },
];

/**
 * Top navigation bar.
 *
 *  • burger           → opens the sidebar drawer on phones/tablets
 *  • view switcher    → only admins may jump between the Commuter and Driver
 *                       views; everybody else sees a static badge for their role
 *  • account menu     → identity, role, and Sign out
 */
export default function Navbar({
  view,
  onViewChange,
  connected,
  profile,
  role,
  isAdmin,
  isDemo,
  onSignOut,
  onOpenSidebar,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClickAway = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const initials = (profile?.fullName || profile?.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <header className="z-[1300] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-2 backdrop-blur sm:h-16 sm:gap-3 sm:px-5">
      {/* Burger (phones/tablets) + brand */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open panel"
          className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-2 text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-300 lg:hidden"
        >
          <Menu size={17} />
        </button>

        <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-2 shadow-lg shadow-cyan-500/25">
          <Bus size={18} className="text-white sm:hidden" />
          <Bus size={20} className="hidden text-white sm:block" />
        </div>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-base font-extrabold tracking-tight sm:text-lg">
            Look Out<span className="text-cyan-400">!</span>
          </h1>
          <p className="hidden text-[11px] text-slate-400 sm:block">
            Iloilo City PUV Live Tracker · LPTRP Routes
          </p>
        </div>
      </div>

      {/* View switcher — admin only */}
      {isAdmin ? (
        <nav className="flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-800/60 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              aria-pressed={view === id}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-semibold transition sm:px-3.5 sm:text-sm ${
                view === id
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/60 px-3 py-1.5 text-xs font-bold text-slate-300">
          {role === 'driver' ? <Bus size={14} /> : <Users size={14} />}
          {role === 'driver' ? 'Driver' : 'Commuter'}
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:inline">
            account
          </span>
        </span>
      )}

      {/* Connection + account */}
      <div className="flex items-center gap-2">
        <div
          className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider md:flex ${
            connected
              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-400/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          <PulseDot color={connected ? 'emerald' : 'rose'} />
          {connected ? 'Live server' : 'Server offline'}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-800/60 py-1 pl-1 pr-2 transition hover:border-cyan-400/60"
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-slate-950 ${
                isAdmin
                  ? 'bg-gradient-to-br from-violet-400 to-fuchsia-600'
                  : 'bg-gradient-to-br from-cyan-500 to-blue-600'
              }`}
            >
              {initials || '?'}
            </span>
            <span className="hidden max-w-[7rem] truncate text-xs font-semibold text-slate-200 sm:block">
              {profile?.fullName ?? 'Account'}
            </span>
            <ChevronDown size={13} className="text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-[1400] mt-2 w-64 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/97 shadow-2xl backdrop-blur">
              <div className="border-b border-slate-800 px-3.5 py-3">
                <p className="truncate text-sm font-bold text-slate-100">
                  {profile?.fullName ?? 'Look Out! user'}
                </p>
                <p className="truncate text-[11px] text-slate-400">{profile?.email ?? '—'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      isAdmin ? 'bg-violet-500/15 text-violet-300' : 'bg-cyan-500/15 text-cyan-300'
                    }`}
                  >
                    {isAdmin ? (
                      <ShieldCheck size={10} />
                    ) : role === 'driver' ? (
                      <Bus size={10} />
                    ) : (
                      <Users size={10} />
                    )}
                    {role ?? 'commuter'}
                  </span>
                  {isDemo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                      <Radio size={10} /> demo mode
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                      firebase
                    </span>
                  )}
                </div>
                {profile?.phone ? (
                  <p className="mt-1.5 text-[11px] text-slate-400">{profile.phone}</p>
                ) : null}
              </div>

              {isAdmin && view !== 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onViewChange('admin');
                  }}
                  className="flex w-full items-center gap-2 border-b border-slate-800 px-3.5 py-3 text-left text-xs font-bold text-violet-300 transition hover:bg-violet-500/10"
                >
                  <ShieldCheck size={14} /> Open admin console
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut?.();
                }}
                className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
