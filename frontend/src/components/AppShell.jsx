import { useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

export default function AppShell({ panel, children, brand = 'Look Out!', open = false, onCloseDrawer, collapsed = false, onToggleCollapse }) {
  return (
    <div className="relative flex h-full min-h-0">
      {/* Desktop sidebar */}
      {!collapsed && (
        <aside className="hidden w-[320px] shrink-0 flex-col border-r bg-[var(--lo-card)]/70 lg:flex xl:w-[350px]" style={{ borderColor: 'var(--lo-panel-border)' }}>
          <header className="flex h-11 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--lo-text-secondary)' }}>{brand}</span>
            <button type="button" onClick={onToggleCollapse} title="Hide panel" aria-label="Hide panel" className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--lo-text-secondary)' }}>
              <PanelLeftClose size={15} />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 pb-28">{panel}</div>
        </aside>
      )}

      {/* Stage */}
      <div className="relative min-h-0 flex-1">
        {collapsed && (
          <button type="button" onClick={onToggleCollapse} title="Show panel" aria-label="Show panel"
            className="absolute left-3 top-3 z-[1100] hidden items-center gap-1.5 rounded-full border bg-[var(--lo-card)]/90 px-3 py-2 text-xs font-bold shadow-xl backdrop-blur transition lg:flex"
            style={{ borderColor: 'var(--lo-panel-border)', color: 'var(--lo-text)' }}>
            <PanelLeftOpen size={14} /> Panel
          </button>
        )}
        {children}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden">
          <button type="button" aria-label="Close panel" onClick={onCloseDrawer} className="fixed inset-0 z-[1400] cursor-default bg-black/30 backdrop-blur-sm" />
          <div className="fixed inset-y-0 left-0 z-[1500] flex w-[88vw] max-w-sm flex-col border-r bg-[var(--lo-panel)] shadow-2xl" style={{ borderColor: 'var(--lo-panel-border)' }}>
            <header className="flex h-12 shrink-0 items-center justify-between border-b px-3.5" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <span className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--lo-text)' }}>{brand}</span>
              <button type="button" onClick={onCloseDrawer} aria-label="Close panel" className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--lo-text-secondary)' }}>
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

export function Section({ icon: Icon, title, badge, children, defaultOpen = true, tint = 'pink' }) {
  const [show, setShow] = useState(defaultOpen);
  const tintClass = { pink: 'var(--lo-pink)', cyan: 'var(--lo-cyan)', sky: 'var(--lo-sky)', yellow: 'var(--lo-yellow)', rose: '#ef4444' }[tint] || 'var(--lo-pink)';

  return (
    <section className="overflow-hidden rounded-2xl border bg-[var(--lo-card)]/80" style={{ borderColor: 'var(--lo-card-border)' }}>
      <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-[var(--lo-card)]/60">
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text)' }}>
          {Icon && <Icon size={13} className="shrink-0" style={{ color: tintClass }} />}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <ChevronDown size={14} className={`transition ${show ? '' : '-rotate-90'}`} style={{ color: 'var(--lo-text-secondary)' }} />
        </span>
      </button>
      {show && <div className="space-y-2.5 px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

export function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span style={{ color: 'var(--lo-text-secondary)' }}>{label}</span>
      <span className={`truncate text-right ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--lo-text)' }}>{value ?? '—'}</span>
    </div>
  );
}
