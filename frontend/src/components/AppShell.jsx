import { Children, Fragment, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import logoImg from '../assets/lookoutLogo.png';

function collectSections(children) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return collectSections(child.props.children);
    if (child.type === Section || child.type?.__lookOutSection || child.type?.displayName === 'LookOutSection') return [child];
    return child.props.children ? collectSections(child.props.children) : [];
  });
}

export default function AppShell({ panel, children, dockItems = [], extraNavigationItems = [], brand = 'Look Out!', open = false, onOpenDrawer, onCloseDrawer, collapsed = false, onToggleCollapse }) {
  const edgeTouchStart = useRef(null);
  const drawerTouchStart = useRef(null);
  const drawerRef = useRef(null);
  const previousFocus = useRef(null);
  const dockRef = useRef(null);
  const dockResetTimeout = useRef(null);
  const [selectedScreenId, setSelectedScreenId] = useState(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeDockItem, setActiveDockItem] = useState(() => dockItems.find((item) => item.active)?.id ?? dockItems[0]?.id);
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
          className={`sidebar-nav__item group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors ${selectedScreenId === id ? 'bg-blue-600 text-white' : 'text-slate-900 hover:bg-blue-600/10 hover:text-blue-600'}`}
        >
          {Icon && <Icon size={19} className="sidebar-nav__icon shrink-0 transition-transform" aria-hidden="true" />}
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

  const handleDockPointerMove = (event) => {
    const dock = dockRef.current;
    if (!dock) return;
    dock.querySelectorAll('.floating-dock__item').forEach((item) => {
      const bounds = item.getBoundingClientRect();
      const distance = Math.abs(event.clientX - (bounds.left + bounds.width / 2));
      const proximity = Math.max(0, 1 - distance / 145);
      item.style.setProperty('--dock-scale', String(1 + proximity * 0.65));
    });
  };

  const handleDockPointerDown = (event) => {
    if (event.pointerType !== 'touch') return;
    window.clearTimeout(dockResetTimeout.current);
    const item = event.target.closest('.floating-dock__item');
    dockRef.current?.querySelectorAll('.floating-dock__item').forEach((dockItem) => {
      dockItem.dataset.touchActive = String(dockItem === item);
    });
    handleDockPointerMove(event);
  };

  const handleDockPointerUp = (event) => {
    if (event.pointerType !== 'touch') return;
    window.clearTimeout(dockResetTimeout.current);
    dockResetTimeout.current = window.setTimeout(resetDockPointer, 700);
  };

  const resetDockPointer = () => {
    window.clearTimeout(dockResetTimeout.current);
    dockRef.current?.querySelectorAll('.floating-dock__item').forEach((item) => {
      item.style.setProperty('--dock-scale', '1');
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
        <aside className="hidden w-[min(24rem,34vw)] min-w-80 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src={logoImg} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              <span className="truncate text-xs font-bold uppercase tracking-[0.12em] text-slate-900">Look Out! <span className="font-medium text-slate-500">· {brand}</span></span>
            </div>
            <button type="button" onClick={onToggleCollapse} title="Hide panel" aria-label="Hide panel" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
              <PanelLeftClose size={15} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-8">{renderNavigation()}</div>
        </aside>
      )}

      {/* Stage */}
      <div className="relative min-h-0 flex-1">
        {collapsed && (
          <button type="button" onClick={onToggleCollapse} title="Show panel" aria-label="Show panel"
            className="absolute left-3 top-3 z-[1100] hidden min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-slate-50 lg:flex">
            <PanelLeftOpen size={14} /> Panel
          </button>
        )}
        {selectedScreen ? (
          <section className="absolute inset-0 z-[1200] flex min-h-0 flex-col overflow-hidden bg-slate-50">
            <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
              <button type="button" onClick={() => { setSelectedScreenId(null); setActiveDockItem(dockItems[0]?.id); }} aria-label="Back to previous screen" className="sidebar-back-button flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-900 transition hover:bg-slate-50">
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
              <span className="text-sm font-bold text-slate-900">{selectedScreen.title}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
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
          className={`fixed inset-0 z-[1400] bg-slate-900/35 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${brand} options`}
          inert={!open}
          onTouchStart={handleDrawerTouchStart}
          onTouchEnd={handleDrawerTouchEnd}
          className={`fixed inset-y-0 left-0 z-[1500] flex w-[min(88vw,24rem)] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        >
            <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <img src={logoImg} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                <span className="truncate text-sm font-bold uppercase tracking-[0.1em] text-slate-900">Look Out! <span className="font-medium text-slate-500">· {brand}</span></span>
              </div>
              <button type="button" onClick={onCloseDrawer} aria-label="Close panel" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-50">
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto pb-8">{renderNavigation()}</div>
        </aside>
      </div>

      {dockItems.length > 0 && (
        <nav
          ref={dockRef}
          onPointerMove={handleDockPointerMove}
          onPointerDown={handleDockPointerDown}
          onPointerUp={handleDockPointerUp}
          onPointerCancel={resetDockPointer}
          onPointerLeave={handleDockPointerLeave}
          id="floating-dock"
          aria-label="Quick navigation"
          data-collapsed={dockCollapsed}
          className="floating-dock fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-[1300] flex items-end gap-2 p-1.5 transition-transform duration-300 ease-out sm:bottom-6 sm:gap-2.5"
        >
          {!dockCollapsed && (
            <button type="button" onClick={() => setDockCollapsed(true)} aria-label="Collapse navigation dock" title="Collapse dock" className="floating-dock__toggle flex min-h-12 min-w-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-xl text-slate-600 transition hover:bg-white/80 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600">
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          )}
          <div className={`floating-dock__items flex items-end gap-2 transition-[max-width,opacity,transform] duration-300 ease-out sm:gap-2.5 ${dockCollapsed ? 'pointer-events-none max-w-0 -translate-x-2 scale-95 overflow-hidden opacity-0' : 'max-w-[30rem] translate-x-0 scale-100 opacity-100'}`}>
            {dockItems.map((item) => {
              const { id, label, icon: Icon, active, disabled } = item;
              const selected = activeDockItem === id || active;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleDockItemClick(item)}
                  disabled={disabled}
                  aria-label={label}
                  aria-current={selected ? 'page' : undefined}
                  title={label}
                  data-active={selected}
                  tabIndex={dockCollapsed ? -1 : 0}
                  className="floating-dock__item relative flex min-h-12 min-w-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-xl text-slate-600 hover:bg-white/80 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:bg-blue-600 data-[active=true]:text-white"
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
            <button type="button" onClick={() => setDockCollapsed(false)} aria-label="Open navigation dock" title="Open navigation dock" className="floating-dock__toggle flex min-h-12 min-w-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-xl text-slate-600 transition hover:bg-white/80 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600">
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          )}
        </nav>
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
    return (
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="flex min-h-14 items-center gap-3 border-b border-slate-200 px-4">
          {Icon && <Icon size={19} className="shrink-0" style={{ color: tintClass }} aria-hidden="true" />}
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        </header>
        <div className="space-y-3 p-4">{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className="scroll-m-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-slate-50">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-wide text-slate-900">
          {Icon && <Icon size={13} className="shrink-0" style={{ color: tintClass }} />}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={16} className={`transition ${show ? '' : '-rotate-90'}`} aria-hidden="true" />
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
