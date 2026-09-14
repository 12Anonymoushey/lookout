import { useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

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
      {/* Desktop sidebar */}
      {!collapsed && (
        <aside className="hidden w-[320px] shrink-0 flex-col border-r border-[var(--lo-panel-border)] bg-[var(--lo-panel)]/60 lg:flex xl:w-[350px]">
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--lo-panel-border)] px-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#b8a0cc]">
              {brand}
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Hide panel"
              aria-label="Hide panel"
              className="rounded-lg p-1.5 text-[#8a7098] transition hover:bg-[#3a2a50] hover:text-[#d8c8e8]"
            >
              <PanelLeftClose size={15} />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 pb-28">{panel}</div>
        </aside>
      )}

      {/* Stage */}
      <div className="relative min-h-0 flex-1">
        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Show panel"
            aria-label="Show panel"
            className="absolute left-3 top-3 z-[1100] hidden items-center gap-1.5 rounded-full border border-[var(--lo-card-border)] bg-[var(--lo-panel)]/90 px-3 py-2 text-xs font-bold text-[#e0d4ec] shadow-xl backdrop-blur transition hover:border-[var(--lo-pink)] hover:text-[var(--lo-pink)] lg:flex"
          >
            <PanelLeftOpen size={14} /> Panel
          </button>
        )}
        {children}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close panel"
            onClick={onCloseDrawer}
            className="fixed inset-0 z-[1400] cursor-default bg-[#0e0a18]/70 backdrop-blur-sm"
          />
          <div className="fixed inset-y-0 left-0 z-[1500] flex w-[88vw] max-w-sm flex-col border-r border-[var(--lo-panel-border)] bg-[var(--lo-panel)] shadow-2xl">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--lo-panel-border)] px-3.5">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#d8c8e8]">
                {brand}
              </span>
              <button
                type="button"
                onClick={onCloseDrawer}
                aria-label="Close panel"
                className="rounded-lg p-1.5 text-[#8a7098] transition hover:bg-[#3a2a50] hover:text-[#d8c8e8]"
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
export function Section({ icon: Icon, title, badge, children, defaultOpen = true, tint = 'pink' }) {
  const [show, setShow] = useState(defaultOpen);

  const tintClass = {
    pink: 'text-[#FF69B4]',
    cyan: 'text-[var(--lo-cyan)]',
    sky: 'text-[var(--lo-sky)]',
    yellow: 'text-[#ffe082]',
    rose: 'text-rose-400',
  }[tint] || 'text-[#FF69B4]';

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-card)]/40">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-expanded={show}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-[#3a2a50]/40"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#e0d4ec]">
          {Icon && <Icon size={13} className={`shrink-0 ${tintClass}`} />}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={14} className={`text-[#8a7098] transition ${show ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {show && <div className="space-y-2.5 px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

/** Small key/value row. */
export function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="text-[#8a7098]">{label}</span>
      <span className={`truncate text-right text-[#e0d4ec] ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}
