import { useEffect, useRef, useState } from 'react';
import { Bus, ChevronDown, LogOut, Menu, ShieldCheck, Users } from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';
import PulseDot from './PulseDot.jsx';

const TABS = [
  { id: 'commuter', label: 'Commuter', icon: Users },
  { id: 'driver', label: 'Driver', icon: Bus },
];

export default function Navbar({
  view,
  onViewChange,
  connected,
  profile,
  role,
  isAdmin,
  isDemo: _isDemo,
  onSignOut,
  onOpenSidebar,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
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

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const initials = (profile?.fullName || profile?.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const handleSignOut = () => {
    setMenuOpen(false);
    setToast('Signed out successfully');
    setTimeout(() => onSignOut?.(), 300);
  };

  return (
    <>
      <header className="z-[1300] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--lo-panel-border)] bg-[var(--lo-panel)]/80 px-2 backdrop-blur sm:h-16 sm:gap-3 sm:px-5">
        {/* Burger + brand */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open panel"
            className="rounded-xl border border-[var(--lo-card-border)] bg-[var(--lo-card)]/60 p-2 text-[#d8c8e8] transition hover:border-[var(--lo-pink)]/60 hover:text-[var(--lo-pink)] lg:hidden"
          >
            <Menu size={17} />
          </button>

          <img src={logoImg} alt="Look Out!" className="h-8 w-8 rounded-xl object-cover shadow-lg sm:h-9 sm:w-9" />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-extrabold tracking-tight sm:text-lg">
              Look Out<span style={{ color: 'var(--lo-pink)' }}>!</span>
            </h1>
          </div>
        </div>

        {/* View switcher — admin only */}
        {isAdmin ? (
          <nav className="flex items-center gap-1 rounded-full border border-[var(--lo-card-border)] bg-[var(--lo-card)]/60 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onViewChange(id)}
                aria-pressed={view === id}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-semibold transition sm:px-3.5 sm:text-sm ${
                  view === id
                    ? 'bg-[var(--lo-pink)] text-white shadow'
                    : 'text-[#d8c8e8] hover:bg-[#3a2a50]'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--lo-card-border)] bg-[var(--lo-card)]/60 px-3 py-1.5 text-xs font-bold text-[#d8c8e8]">
            {role === 'driver' ? <Bus size={14} /> : <Users size={14} />}
            {role === 'driver' ? 'Driver' : 'Commuter'}
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
            {connected ? 'Live' : 'Offline'}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full border border-[var(--lo-card-border)] bg-[var(--lo-card)]/60 py-1 pl-1 pr-2 transition hover:border-[var(--lo-pink)]/60"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#FF69B4] to-[#d4509a] text-[11px] font-black text-white"
              >
                {initials || '?'}
              </span>
              <span className="hidden max-w-[7rem] truncate text-xs font-semibold text-[#e0d4ec] sm:block">
                {profile?.fullName ?? 'Account'}
              </span>
              <ChevronDown size={13} className="text-[#8a7098]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-[1400] mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-panel)] shadow-2xl backdrop-blur">
                <div className="border-b border-[var(--lo-panel-border)] px-3.5 py-3">
                  <p className="truncate text-sm font-bold text-[#f0e6f6]">
                    {profile?.fullName ?? 'Look Out! user'}
                  </p>
                  <p className="truncate text-[11px] text-[#b8a0cc]">{profile?.email ?? '—'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isAdmin ? 'bg-[#9b59b6]/15 text-[#c39bd3]' : 'bg-[var(--lo-pink)]/15 text-[var(--lo-pink)]'
                      }`}
                    >
                      {isAdmin ? <ShieldCheck size={10} /> : role === 'driver' ? <Bus size={10} /> : <Users size={10} />}
                      {role ?? 'commuter'}
                    </span>
                  </div>
                </div>

                {isAdmin && view !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onViewChange('admin');
                    }}
                    className="flex w-full items-center gap-2 border-b border-[var(--lo-panel-border)] px-3.5 py-3 text-left text-xs font-bold text-[#c39bd3] transition hover:bg-[#9b59b6]/10"
                  >
                    <ShieldCheck size={14} /> Admin console
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sign out confirmation toast */}
      {toast && (
        <div className="lo-toast pointer-events-none fixed left-1/2 top-16 z-[2000] -translate-x-1/2 rounded-full border border-emerald-400/50 bg-[var(--lo-panel)] px-4 py-2 text-xs font-bold text-emerald-300 shadow-xl">
          ✓ {toast}
        </div>
      )}
    </>
  );
}
