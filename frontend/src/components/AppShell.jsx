import { useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

/**
 * APP SHELL
 * The dashboard frame shared by the Commuter, Driver and Admin views:
 *
 *   desktop → a real sidebar on the left (collapsible to give the map the
 *             whole window) plus the main stage
 *   mobile  → the stage goes full-bleed and the same sidebar slides in as a
 *             drawer from the burger in the navbar
 *
 * `panel` is rendered inside the sidebar/drawer; `children` is the main stage.
 */
export default function AppShell({
  panel,
  children,
  brand = 'Look Out!',
  open = false,
  onCloseDrawer,
  collapsed = false,
  onToggleCollapse,
}) {
  return (
    <div className="relative flex h-full min-h-0">
      {/* ------------------------------ desktop sidebar ---------------------------- */}
      {!collapsed && (
        <aside className="hidden w-[320px] shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 lg:flex xl:w-[350px]">
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 px-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {brand}
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Hide panel"
              aria-label="Hide panel"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              <PanelLeftClose size={15} />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 pb-28">{panel}</div>
        </aside>
      )}

      {/* ---------------------------------- stage --------------------------------- */}
      <div className="relative min-h-0 flex-1">
        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Show panel"
            aria-label="Show panel"
            className="absolute left-3 top-3 z-[1100] hidden items-center gap-1.5 rounded-full border border-slate-600/80 bg-slate-900/90 px-3 py-2 text-xs font-bold text-slate-200 shadow-xl backdrop-blur transition hover:border-cyan-400 hover:text-cyan-300 lg:flex"
          >
            <PanelLeftOpen size={14} /> Panel
          </button>
        )}
        {children}
      </div>

      {/* ------------------------------ mobile drawer ----------------------------- */}
      {open && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close panel"
            onClick={onCloseDrawer}
            className="fixed inset-0 z-[1400] cursor-default bg-slate-950/70 backdrop-blur-sm"
          />
          <div className="fixed inset-y-0 left-0 z-[1500] flex w-[88vw] max-w-sm flex-col border-r border-slate-800 bg-slate-900 shadow-2xl">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-3.5">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
                {brand}
              </span>
              <button
                type="button"
                onClick={onCloseDrawer}
                aria-label="Close panel"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 pb-24">{panel}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Collapsible titled card used inside the panel. */
export function Section({ icon: Icon, title, badge, children, defaultOpen = true, tint = 'cyan' }) {
  const [show, setShow] = useState(defaultOpen);

  const tintClass = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    violet: 'text-violet-400',
    rose: 'text-rose-400',
    blue: 'text-blue-400',
  }[tint];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800/40">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-expanded={show}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-slate-800/60"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
          {Icon && <Icon size={13} className={`shrink-0 ${tintClass}`} />}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={14} className={`text-slate-400 transition ${show ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {show && <div className="space-y-2.5 px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

/** Small key/value row used across the panels. */
export function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className={`truncate text-right text-slate-200 ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}
