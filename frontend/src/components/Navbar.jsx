import { useEffect, useRef, useState } from 'react';
import { Bus, ChevronDown, LogOut, Menu, ShieldCheck, Users } from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';
import PulseDot from './PulseDot.jsx';

const TABS = [
  { id: 'commuter', label: 'Commuter', icon: Users },
  { id: 'driver', label: 'Driver', icon: Bus },
];

export default function Navbar({ view, onViewChange, connected, profile, role, isAdmin, isDemo: _isDemo, onSignOut, onOpenSidebar }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const away = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id); }, [toast]);

  const initials = (profile?.fullName || profile?.email || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const handleSignOut = () => { setMenuOpen(false); setToast('Signed out successfully'); setTimeout(() => onSignOut?.(), 300); };

  return (
    <>
      <header className="z-[1300] flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 backdrop-blur sm:h-16 sm:gap-3 sm:px-5"
        style={{ borderColor: 'var(--lo-panel-border)', backgroundColor: 'rgba(255,232,117,0.85)' }}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button type="button" onClick={onOpenSidebar} aria-label="Open panel" className="rounded-xl border p-2 transition lg:hidden" style={{ borderColor: 'var(--lo-panel-border)', color: 'var(--lo-text-secondary)' }}>
            <Menu size={17} />
          </button>
          <img src={logoImg} alt="Look Out!" className="h-8 w-8 rounded-xl object-cover shadow sm:h-9 sm:w-9" />
          <h1 className="truncate text-base font-extrabold tracking-tight sm:text-lg" style={{ color: 'var(--lo-text)' }}>
            Look Out<span style={{ color: 'var(--lo-pink)' }}>!</span>
          </h1>
        </div>

        {isAdmin ? (
          <nav className="flex items-center gap-1 rounded-full border p-1" style={{ borderColor: 'var(--lo-panel-border)' }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => onViewChange(id)} aria-pressed={view === id}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-semibold transition sm:px-3.5 sm:text-sm ${view === id ? 'text-white shadow' : 'hover:opacity-80'}`}
                style={view === id ? { background: 'var(--lo-pink)' } : { color: 'var(--lo-text)' }}>
                <Icon size={14} /><span>{label}</span>
              </button>
            ))}
          </nav>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--lo-panel-border)', color: 'var(--lo-text)' }}>
            {role === 'driver' ? <Bus size={14} /> : <Users size={14} />}
            {role === 'driver' ? 'Driver' : 'Commuter'}
          </span>
        )}

        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider md:flex ${connected ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-rose-300 bg-rose-50 text-rose-700'}`}>
            <PulseDot color={connected ? 'emerald' : 'rose'} />
            {connected ? 'Live' : 'Offline'}
          </div>

          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 transition" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: 'linear-gradient(135deg, var(--lo-pink), #e05090)' }}>
                {initials || '?'}
              </span>
              <span className="hidden max-w-[7rem] truncate text-xs font-semibold sm:block" style={{ color: 'var(--lo-text)' }}>{profile?.fullName ?? 'Account'}</span>
              <ChevronDown size={13} style={{ color: 'var(--lo-text-secondary)' }} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-[1400] mt-2 w-64 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
                <div className="border-b px-3.5 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
                  <p className="truncate text-sm font-bold" style={{ color: 'var(--lo-text)' }}>{profile?.fullName ?? 'User'}</p>
                  <p className="truncate text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>{profile?.email ?? '—'}</p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: isAdmin ? 'rgba(155,89,182,0.1)' : 'rgba(255,102,161,0.1)', color: isAdmin ? '#9b59b6' : 'var(--lo-pink)' }}>
                    {isAdmin ? <ShieldCheck size={10} /> : role === 'driver' ? <Bus size={10} /> : <Users size={10} />}
                    {role ?? 'commuter'}
                  </span>
                </div>
                {isAdmin && view !== 'admin' && (
                  <button type="button" onClick={() => { setMenuOpen(false); onViewChange('admin'); }}
                    className="flex w-full items-center gap-2 border-b px-3.5 py-3 text-left text-xs font-bold transition" style={{ borderColor: 'var(--lo-panel-border)', color: '#9b59b6' }}>
                    <ShieldCheck size={14} /> Admin console
                  </button>
                )}
                <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-bold text-rose-500 transition hover:bg-rose-50">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {toast && (
        <div className="lo-toast pointer-events-none fixed left-1/2 top-16 z-[2000] -translate-x-1/2 rounded-full border border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-700 shadow-xl">
          ✓ {toast}
        </div>
      )}
    </>
  );
}
