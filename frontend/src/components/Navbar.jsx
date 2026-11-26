import { useCallback, useEffect, useRef, useState } from 'react';
import { EllipsisVertical, LogOut, Menu, ShieldCheck, Users, Bus } from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';
import { AnimatedPopup } from './AppShell.jsx';
import PulseDot from './PulseDot.jsx';

export default function Navbar({ view, onViewChange, connected, profile, role, isAdmin, isDemo: _isDemo, onSignOut, onOpenSidebar }) {
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuPhase, setMenuPhase] = useState('closed');
  const [toast, setToast] = useState('');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const menuRef = useRef(null);
  const menuCloseTimer = useRef(null);

  const openAccountMenu = useCallback(() => {
    window.clearTimeout(menuCloseTimer.current);
    setMenuMounted(true);
    setMenuPhase('enter');
  }, []);

  const closeAccountMenu = useCallback(() => {
    if (menuPhase === 'closed' || menuPhase === 'exit') return;
    setMenuPhase('exit');
    window.clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = window.setTimeout(
      () => {
        setMenuMounted(false);
        setMenuPhase('closed');
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 200,
    );
  }, [menuPhase]);

  useEffect(() => {
    if (!menuMounted || menuPhase === 'exit') return undefined;
    const away = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) closeAccountMenu(); };
    const esc = (e) => { if (e.key === 'Escape') closeAccountMenu(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuMounted, menuPhase, closeAccountMenu]);

  useEffect(() => () => window.clearTimeout(menuCloseTimer.current), []);

  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id); }, [toast]);

  const handleSignOut = () => {
    setToast('Signed out successfully');
    setConfirmSignOut(false);
    closeAccountMenu();
    setTimeout(() => onSignOut?.(), 900);
  };

  return (
    <>
      <header className={`lo-glass-surface relative ${menuMounted ? 'z-[1500]' : 'z-[1050]'} flex h-14 shrink-0 items-center justify-between gap-2 px-2 sm:h-16 sm:gap-3 sm:px-5`}>
        <div className="z-10 flex min-w-0 items-center">
          <button type="button" onClick={onOpenSidebar} aria-label="Open panel" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#E9F3F8]/30 text-[#DFE3E9]   lg:hidden">
            <Menu size={17} />
          </button>
        </div>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <img src={logoImg} alt="" className="h-8 w-8 rounded-lg object-cover sm:h-9 sm:w-9" />
          <h1 className="whitespace-nowrap text-base font-extrabold tracking-tight text-[#101B2F] sm:text-lg">
            Look Out<span className="text-[#236BEB]">!</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider md:flex ${connected ? 'border-[#14B383] bg-[#14B383] text-[#F5F8FC]' : 'border-[#618C8C] bg-[#618C8C] text-[#F5F8FC]'}`}>
            <PulseDot color={connected ? 'emerald' : 'slate'} />
            {connected ? 'Live' : 'Offline'}
          </div>

          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => (menuPhase === 'closed' || menuPhase === 'exit' ? openAccountMenu() : closeAccountMenu())} aria-label="Open account menu" aria-expanded={menuPhase === 'enter'} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#101B2F]   ">
              <EllipsisVertical size={21} />
            </button>

            {menuMounted && (
              <div inert={menuPhase === 'exit'} className={`lo-account-menu lo-account-menu-${menuPhase} absolute right-0 top-full z-[1400] mt-2 w-64 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur ${menuPhase === 'exit' ? 'pointer-events-none' : ''}`} style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
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
                      <button key={id} type="button" onClick={() => { closeAccountMenu(); onViewChange(id); }}
                        className="flex w-full items-center gap-2 border-b px-3.5 py-3 text-left text-xs font-bold text-slate-900  " style={{ borderColor: 'var(--lo-panel-border)' }}>
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </>
                )}
                {isAdmin && view !== 'admin' && (
                  <button type="button" onClick={() => { closeAccountMenu(); onViewChange('admin'); }}
                    className="flex w-full items-center gap-2 border-b px-3.5 py-3 text-left text-xs font-bold " style={{ borderColor: 'var(--lo-panel-border)', color: 'var(--lo-primary)' }}>
                    <ShieldCheck size={14} /> Admin console
                  </button>
                )}
                <button type="button" onClick={() => { closeAccountMenu(); setConfirmSignOut(true); }} className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-bold text-slate-900  ">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {toast && (
        <div className="lo-toast pointer-events-none fixed left-1/2 top-16 z-[9999] -translate-x-1/2 rounded-full border border-emerald-500 bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-xl">
          ✓ {toast}
        </div>
      )}
      <AnimatedPopup open={confirmSignOut}>
        {confirmSignOut && (
            <div role="dialog" aria-modal="true" aria-label="Sign out of LookOut" className="lo-dialog-card w-full max-w-sm p-4">
              <p className="text-sm font-bold text-slate-900">Sign out of LookOut?</p>
              <p className="mt-1 text-xs text-slate-500">Your current session will end.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmSignOut(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button>
                <button type="button" onClick={handleSignOut} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white">Sign out</button>
              </div>
            </div>
        )}
      </AnimatedPopup>
    </>
  );
}
