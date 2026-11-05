import { Children, Fragment, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Info, Mail, MessageSquareText, Pencil, Phone, PanelLeftClose, PanelLeftOpen, UserRound, Users, X } from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';
import bannerImg from '../assets/lookoutBanner.png';
import { addUtilityInboxItem } from '../services/utilityInboxService.js';

function collectSections(children) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return collectSections(child.props.children);
    if (child.type === Section || child.type?.__lookOutSection || child.type?.displayName === 'LookOutSection') return [child];
    return child.props.children ? collectSections(child.props.children) : [];
  });
}

export default function AppShell({ panel, children, dockItems = [], extraNavigationItems = [], brand = 'Look Out!', utilityProfile, open = false, onOpenDrawer, onCloseDrawer, collapsed = false, onToggleCollapse }) {
  const edgeTouchStart = useRef(null);
  const drawerTouchStart = useRef(null);
  const drawerRef = useRef(null);
  const previousFocus = useRef(null);
  const dockRef = useRef(null);
  const dockResetTimeout = useRef(null);
  const [selectedScreenId, setSelectedScreenId] = useState(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeDockItem, setActiveDockItem] = useState(() => dockItems.find((item) => item.active)?.id ?? dockItems[0]?.id);
  const [utilityModal, setUtilityModal] = useState('');
  const [utilityMessage, setUtilityMessage] = useState('');
  const [utilityToast, setUtilityToast] = useState('');
  const sectionElements = collectSections(panel);
  const navigationItems = [
    ...sectionElements.map((element, index) => ({
      id: element.props.id ?? `${brand.toLowerCase()}-section-${index}`,
      title: element.props.title ?? `Section ${index + 1}`,
      icon: element.props.icon,
      element,
    })),
    ...extraNavigationItems,
  ];
  const selectedScreen = navigationItems.find((item) => item.id === selectedScreenId);

  const utilityButtons = (
    <div className="border-t border-slate-200 p-3">
      <button type="button" onClick={() => setUtilityModal('ask')} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-slate-700"><Users size={17} /> Ask admin</button>
      <button type="button" onClick={() => setUtilityModal('feedback')} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-slate-700"><MessageSquareText size={17} /> Feedback</button>
      <button type="button" onClick={() => setUtilityModal('about')} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-slate-700"><Info size={17} /> About the app</button>
    </div>
  );

  const renderNavigation = () => (
    <nav aria-label={`${brand} sections`} className="space-y-1.5 p-3">
      {navigationItems.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          No sections are available right now.
        </p>
      ) : navigationItems.map(({ id, title, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setSelectedScreenId(id);
            setActiveDockItem(dockItems.find((item) => item.target === id)?.id);
            onCloseDrawer?.();
          }}
          aria-current={selectedScreenId === id ? 'page' : undefined}
          className={`sidebar-nav__item lo-sidebar-tab group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold  ${selectedScreenId === id ? 'bg-blue-600 text-white' : 'text-slate-900  '}`}
        >
          {Icon && <Icon size={19} className="sidebar-nav__icon shrink-0 " aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </button>
      ))}
    </nav>
  );

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    drawerRef.current?.querySelector('button')?.focus();
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseDrawer?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open, onCloseDrawer]);

  useEffect(() => {
    if (!utilityToast) return undefined;
    const timeout = window.setTimeout(() => setUtilityToast(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [utilityToast]);

  const handleEdgeTouchStart = (event) => {
    const touch = event.touches[0];
    edgeTouchStart.current = !open && touch.clientX <= 24 ? touch.clientX : null;
  };

  const handleEdgeTouchEnd = (event) => {
    if (edgeTouchStart.current === null) return;
    if (event.changedTouches[0].clientX - edgeTouchStart.current > 72) onOpenDrawer?.();
    edgeTouchStart.current = null;
  };

  const handleDrawerTouchStart = (event) => {
    drawerTouchStart.current = event.touches[0].clientX;
  };

  const handleDrawerTouchEnd = (event) => {
    if (drawerTouchStart.current === null) return;
    if (drawerTouchStart.current - event.changedTouches[0].clientX > 72) onCloseDrawer?.();
    drawerTouchStart.current = null;
  };

  const handleDockItemClick = (item) => {
    if (item.radio) return;
    setActiveDockItem(item.id);
    if (item.onSelect) {
      if (item.returnToMap) setSelectedScreenId(null);
      item.onSelect();
      return;
    }

    const navigationItem = navigationItems.find(({ id }) => id === item.target);
    if (navigationItem) {
      setSelectedScreenId(navigationItem.id);
      onCloseDrawer?.();
      return;
    }

    if (item.target) {
      setSelectedScreenId(null);
      document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleDockPointerDown = (event) => {
    if (event.pointerType !== 'touch') return;
    window.clearTimeout(dockResetTimeout.current);
    const item = event.target.closest('.floating-dock__item');
    dockRef.current?.querySelectorAll('.floating-dock__item').forEach((dockItem) => {
      dockItem.dataset.touchActive = String(dockItem === item);
    });
  };

  const handleDockPointerUp = (event) => {
    if (event.pointerType !== 'touch') return;
    window.clearTimeout(dockResetTimeout.current);
    dockResetTimeout.current = window.setTimeout(resetDockPointer, 700);
  };

  const resetDockPointer = () => {
    window.clearTimeout(dockResetTimeout.current);
    dockRef.current?.querySelectorAll('.floating-dock__item').forEach((item) => {
      delete item.dataset.touchActive;
    });
  };

  const handleDockPointerLeave = (event) => {
    if (event.pointerType === 'mouse') resetDockPointer();
  };

  return (
    <div className="relative flex h-full min-h-0" onTouchStart={handleEdgeTouchStart} onTouchEnd={handleEdgeTouchEnd}>
      {/* Desktop sidebar */}
      {!collapsed && (
        <aside className="lo-desktop-sidebar hidden w-[min(24rem,34vw)] min-w-80 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src={logoImg} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              <span className="truncate text-xs font-bold uppercase tracking-[0.12em] text-slate-900">Look Out! <span className="font-medium text-slate-500">· {brand}</span></span>
            </div>
            <button type="button" onClick={onToggleCollapse} title="Hide panel" aria-label="Hide panel" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500   ">
              <PanelLeftClose size={15} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">{renderNavigation()}</div>
          {utilityButtons}
        </aside>
      )}

      {/* Stage */}
      <div className="relative min-h-0 flex-1">
        {collapsed && (
          <button type="button" onClick={onToggleCollapse} title="Show panel" aria-label="Show panel"
            className="absolute left-3 top-3 z-[1100] hidden min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 shadow-lg   lg:flex">
            <PanelLeftOpen size={14} /> Panel
          </button>
        )}
        {selectedScreen ? (
          <section key={selectedScreen.id} className="lo-screen-enter absolute inset-0 z-[1200] flex min-h-0 flex-col overflow-hidden bg-slate-50">
            <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
              <button type="button" onClick={() => { setSelectedScreenId(null); setActiveDockItem(dockItems[0]?.id); }} aria-label="Back to previous screen" className="sidebar-back-button flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-900  ">
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
              <span className="text-sm font-bold text-slate-900">{selectedScreen.title}</span>
            </header>
            <div className={`min-h-0 flex-1 overflow-y-auto ${selectedScreen.title === 'My Details' || selectedScreen.title === 'Admin' ? 'p-0' : 'p-3 sm:p-5'}`}>
              {selectedScreen.useCurrentScreen
                ? children
                : selectedScreen.content ?? cloneElement(selectedScreen.element, { screen: true })}
            </div>
          </section>
        ) : children}
      </div>

      {/* Mobile drawer */}
      <div className={`lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <button type="button" aria-label="Close panel" onClick={onCloseDrawer}
          tabIndex={open ? 0 : -1}
          className={`fixed inset-0 z-[1400] bg-slate-900/35 backdrop-blur-sm  duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${brand} options`}
          inert={!open}
          onTouchStart={handleDrawerTouchStart}
          onTouchEnd={handleDrawerTouchEnd}
          className={`fixed inset-y-0 left-0 z-[1500] flex w-[min(88vw,24rem)] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-[280ms] ease-[cubic-bezier(0.2,0.75,0.25,1)] ${open ? 'translate-x-0' : '-translate-x-full'}`}
        >
            <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <img src={logoImg} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                <span className="truncate text-sm font-bold uppercase tracking-[0.1em] text-slate-900">Look Out! <span className="font-medium text-slate-500">· {brand}</span></span>
              </div>
              <button type="button" onClick={onCloseDrawer} aria-label="Close panel" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500  ">
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">{renderNavigation()}</div>
            {utilityButtons}
        </aside>
      </div>

      {dockItems.length > 0 && (
        <nav
          ref={dockRef}
          onPointerDown={handleDockPointerDown}
          onPointerUp={handleDockPointerUp}
          onPointerCancel={resetDockPointer}
          onPointerLeave={handleDockPointerLeave}
          id="floating-dock"
          aria-label="Quick navigation"
          data-collapsed={dockCollapsed}
          className="floating-dock fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[1300] flex items-end gap-2 p-1.5  duration-300 ease-out sm:bottom-6 sm:gap-2.5"
        >
          {!dockCollapsed && (
            <button type="button" onClick={() => setDockCollapsed(true)} aria-label="Collapse navigation dock" title="Collapse dock" className="floating-dock__toggle flex min-h-12 min-w-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-xl text-slate-600    focus-visible:outline-2 focus-visible:outline-blue-600">
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          )}
          <div className={`floating-dock__items flex items-end gap-2  duration-300 ease-out sm:gap-2.5 ${dockCollapsed ? 'pointer-events-none max-w-0 -translate-x-2 scale-95 overflow-hidden opacity-0' : 'max-w-[30rem] translate-x-0 scale-100 opacity-100'}`}>
            {dockItems.map((item) => {
              const { id, label, icon: Icon, active, disabled } = item;
              const selected = activeDockItem === id || active;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleDockItemClick(item)}
                  onPointerDown={(event) => {
                    if (item.radio) {
                      event.preventDefault();
                      window.dispatchEvent(new Event('lookout-radio-start'));
                    }
                  }}
                  onPointerUp={(_event) => {
                    if (item.radio) window.dispatchEvent(new Event('lookout-radio-stop'));
                  }}
                  onPointerLeave={() => {
                    if (item.radio && event.buttons) window.dispatchEvent(new Event('lookout-radio-stop'));
                  }}
                  disabled={disabled}
                  aria-label={label}
                  aria-current={selected ? 'page' : undefined}
                  title={label}
                  data-active={selected}
                  tabIndex={dockCollapsed ? -1 : 0}
                  className="floating-dock__item relative flex min-h-12 min-w-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-xl text-slate-600   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:bg-blue-600 data-[active=true]:text-white"
                >
                  <Icon size={22} aria-hidden="true" />
                  <span className="floating-dock__label pointer-events-none absolute bottom-full left-1/2 mb-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg" aria-hidden="true">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          {dockCollapsed && (
            <button type="button" onClick={() => setDockCollapsed(false)} aria-label="Open navigation dock" title="Open navigation dock" className="floating-dock__toggle flex min-h-12 min-w-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-xl text-slate-600    focus-visible:outline-2 focus-visible:outline-blue-600">
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          )}
        </nav>
      )}
      {utilityModal && (
        <div className={`fixed inset-0 z-[5000] bg-slate-900/40 backdrop-blur-sm ${utilityModal === 'about' ? '' : 'flex items-center justify-center p-4'}`} role="dialog" aria-modal="true">
          <div className={utilityModal === 'about' ? 'absolute inset-0 overflow-y-auto bg-white' : 'max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl'}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold text-slate-900">{utilityModal === 'about' ? 'About LookOut!' : utilityModal === 'ask' ? 'Ask an admin' : 'Send feedback'}</h2>
              {utilityModal !== 'about' && <button type="button" onClick={() => setUtilityModal('')} className="min-h-10 min-w-10 text-slate-500" aria-label="Close"><X size={18} /></button>}
            </div>
            {utilityModal === 'about' ? (
              <div className="relative min-h-full overflow-hidden">
                <button type="button" onClick={() => setUtilityModal('')} className="absolute right-4 top-4 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg" aria-label="Close"><X size={20} /></button>
                <img src={bannerImg} alt="LookOut!" className="h-[42vh] w-full object-cover" />
                <div className="relative mx-auto -mt-14 max-w-3xl px-5 pb-12 sm:px-8">
                  <div className="-ml-1 h-28 w-28 rounded-[2rem] border-8 border-white bg-white shadow-xl sm:h-32 sm:w-32">
                    <img src={logoImg} alt="LookOut! logo" className="h-full w-full rounded-[1.45rem] object-cover" />
                  </div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.3em] text-blue-600">Credits & project overview</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">LookOut!</h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">A real-time public utility vehicle tracking app designed to help commuters, drivers, and administrators coordinate safer and more efficient trips across Iloilo City.</p>
                  <div className="mt-10 border-t border-slate-200 pt-8">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Project creators</p>
                    <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
                      {['Braga, Jessa Mae', 'De Guia, Ryzel John', 'Degala, Carlo Jay', 'Pangantihon, Joshua John Ezekiel', 'Yasa, Lianne Dane'].map((name) => (
                        <div key={name} className="bg-white px-5 py-4 text-sm font-bold text-slate-900">{name}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <textarea value={utilityMessage} onChange={(event) => setUtilityMessage(event.target.value)} className="min-h-32 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/30" placeholder={utilityModal === 'ask' ? 'What would you like to ask an admin?' : 'Share your feedback about LookOut!'} />
                <button type="button" disabled={!utilityMessage.trim()} onClick={() => {
                  addUtilityInboxItem({ type: utilityModal === 'ask' ? 'admin-question' : 'feedback', message: utilityMessage, sender: utilityProfile?.fullName || utilityProfile?.email || 'LookOut! user' });
                  setUtilityMessage('');
                  setUtilityModal('');
                  setUtilityToast(utilityModal === 'ask' ? 'Question sent to admin' : 'Feedback submitted');
                }} className="mt-3 min-h-11 w-full rounded-xl bg-blue-600 text-xs font-bold text-white disabled:opacity-40">{utilityModal === 'ask' ? 'Send to admin' : 'Submit feedback'}</button>
              </>
            )}
            {utilityToast && (
              <div className="lo-toast fixed bottom-20 left-1/2 z-[6000] -translate-x-1/2 rounded-full border border-emerald-500 bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-xl">
                {utilityToast}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Section({ id, icon: Icon, title, badge, children, defaultOpen = true, tint = 'primary', screen = false }) {
  const [show, setShow] = useState(defaultOpen);
  const tintClass = {
    primary: 'var(--lo-primary)',
    success: 'var(--lo-success)',
    critical: 'var(--lo-critical)',
  }[tint] || 'var(--lo-primary)';

  if (screen) {
    const fullScreenProfile = title === 'My Details' || title === 'Admin';
    return (
      <section className={fullScreenProfile ? 'min-h-full w-full' : 'mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white'}>
        {!fullScreenProfile && (
        <header className="flex min-h-14 items-center gap-3 border-b border-slate-200 px-4">
          {Icon && <Icon size={19} className="shrink-0" style={{ color: tintClass }} aria-hidden="true" />}
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        </header>
        )}
        <div className={fullScreenProfile ? '' : 'space-y-3 p-4'}>{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className="scroll-m-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left  ">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-wide text-slate-900">
          {Icon && <Icon size={13} className="shrink-0" style={{ color: tintClass }} />}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={16} className={show ? '' : '-rotate-90'} aria-hidden="true" />
        </span>
      </button>
      {show && <div className="space-y-2.5 px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

Section.displayName = 'LookOutSection';
Section.__lookOutSection = true;

export function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex min-h-8 items-start justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`truncate text-right text-slate-900 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

export function ProfileScreen({ profile, role, onEdit, stats = [], fallbackName = 'User' }) {
  const displayName = profile?.fullName || fallbackName;
  const initials = displayName.trim().charAt(0).toUpperCase() || 'U';
  const details = [
    { label: 'Name', value: profile?.fullName || '—', icon: UserRound },
    { label: 'Email', value: profile?.email || '—', icon: Mail },
    { label: 'Mobile', value: profile?.phone || '—', icon: Phone },
  ];

  return (
    <div className="min-h-full bg-slate-50 pb-10">
      <div className="relative overflow-hidden px-5 pb-16 pt-6 text-white sm:px-8 sm:pb-20 sm:pt-8" style={{ background: 'var(--lo-primary)' }}>
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit details"
            className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/15 text-white sm:right-7 sm:top-6"
          >
            <Pencil size={18} />
          </button>
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 h-24 w-24 overflow-hidden rounded-full border-4 border-white/90 bg-white shadow-lg sm:h-28 sm:w-28">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-blue-50 text-3xl font-black" style={{ color: 'var(--lo-primary)' }}>{initials}</div>
              )}
            </div>
            <h2 className="text-xl font-black sm:text-2xl">{displayName}</h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white/75">{role}</p>
          </div>
          {stats.length > 0 && (
            <div className="mt-5 grid grid-cols-2 divide-x divide-white/25 text-center sm:mx-auto sm:max-w-xl">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-sm font-black sm:text-base">{stat.value}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-white/70">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto -mt-10 max-w-4xl px-3 sm:-mt-12 sm:px-6">
        <div className="rounded-[1.75rem] border border-slate-100 bg-white px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.12)] sm:px-7">
          <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">About me</p>
          <div className="grid gap-3 md:grid-cols-3">
            {details.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50" style={{ color: 'var(--lo-primary)' }}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="truncate text-xs font-bold text-slate-800">{value}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-white sm:max-w-xs"
            style={{ background: 'var(--lo-primary)' }}
          >
            <Pencil size={14} /> Edit Details
          </button>
        </div>
      </div>
    </div>
  );
}
