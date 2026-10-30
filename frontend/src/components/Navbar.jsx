import { useEffect, useRef, useState } from 'react';
import { EllipsisVertical, LogOut, Menu, ShieldCheck, Users, Bus } from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';
import PulseDot from './PulseDot.jsx';

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

  const handleSignOut = () => { setMenuOpen(false); setToast('Signed out successfully'); setTimeout(() => onSignOut?.(), 300); };

  return (
    <>
      <header className="relative z-[1300] flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 backdrop-blur sm:h-16 sm:gap-3 sm:px-5"
        style={{ borderColor: 'var(--lo-panel-border)', backgroundColor: 'var(--lo-panel)' }}>
        <div className="z-10 flex min-w-0 items-center">
          <button type="button" onClick={onOpenSidebar} aria-label="Open panel" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 lg:hidden">
            <Menu size={17} />
          </button>
        </div>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <img src={logoImg} alt="" className="h-8 w-8 rounded-lg object-cover sm:h-9 sm:w-9" />
          <h1 className="whitespace-nowrap text-base font-extrabold tracking-tight sm:text-lg" style={{ color: 'var(--lo-text)' }}>
            Look Out<span style={{ color: 'var(--lo-primary)' }}>!</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider md:flex ${connected ? 'border-emerald-500 bg-emerald-500 text-slate-900' : 'border-red-500 bg-red-500 text-slate-900'}`}>
            <PulseDot color={connected ? 'emerald' : 'red'} />
            {connected ? 'Live' : 'Offline'}
          </div>

          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Open account menu" aria-expanded={menuOpen} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
              <EllipsisVertical size={21} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-[1400] mt-2 w-64 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
                <div className="border-b px-3.5 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
                  <p className="truncate text-sm font-bold" style={{ color: 'var(--lo-text)' }}>{profile?.fullName ?? 'User'}</p>
                  <p className="truncate text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>{profile?.email ?? '—'}</p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: 'var(--lo-bg)', color: 'var(--lo-primary)' }}>
                    {isAdmin ? <ShieldCheck size={10} /> : role === 'driver' ? <Bus size={10} /> : <Users size={10} />}
                    {role ?? 'commuter'}
                  </span>
                </div>
                {isAdmin && (
                  <>
                    {[
                      { id: 'commuter', label: 'Commuter view', icon: Users },
                      { id: 'driver', label: 'Driver view', icon: Bus },
                    ].filter((tab) => tab.id !== view).map(({ id, label, icon: Icon }) => (
                      <button key={id} type="button" onClick={() => { setMenuOpen(false); onViewChange(id); }}
                        className="flex w-full items-center gap-2 border-b px-3.5 py-3 text-left text-xs font-bold text-slate-900 transition hover:bg-slate-50" style={{ borderColor: 'var(--lo-panel-border)' }}>
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </>
                )}
                {isAdmin && view !== 'admin' && (
                  <button type="button" onClick={() => { setMenuOpen(false); onViewChange('admin'); }}
                    className="flex w-full items-center gap-2 border-b px-3.5 py-3 text-left text-xs font-bold transition" style={{ borderColor: 'var(--lo-panel-border)', color: 'var(--lo-primary)' }}>
                    <ShieldCheck size={14} /> Admin console
                  </button>
                )}
                <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-bold text-slate-900 transition hover:bg-slate-50">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {toast && (
        <div className="lo-toast pointer-events-none fixed left-1/2 top-16 z-[2000] -translate-x-1/2 rounded-full border border-emerald-500 bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-xl">
          ✓ {toast}
        </div>
      )}
    </>
  );
}
