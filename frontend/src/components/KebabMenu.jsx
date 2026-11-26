import { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical, ArrowUpDown, ArrowDown, ArrowUp, Eye, X } from 'lucide-react';
import { AnimatedPopup } from './AppShell.jsx';

/**
 * Three-dot kebab menu with actions. Click outside to close.
 */
export function KebabMenu({ items = [] }) {
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuPhase, setMenuPhase] = useState('closed');
  const ref = useRef(null);
  const closeTimer = useRef(null);
  const openMenu = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setMenuMounted(true);
    setMenuPhase('enter');
  }, []);

  const closeMenu = useCallback(() => {
    if (menuPhase === 'closed' || menuPhase === 'exit') return;
    setMenuPhase('exit');
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setMenuMounted(false);
      setMenuPhase('closed');
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 160);
  }, [menuPhase]);

  useEffect(() => {
    if (!menuMounted || menuPhase === 'exit') return undefined;
    const onAway = (e) => {
      if (ref.current && !ref.current.contains(e.target)) closeMenu();
    };
    const onEscape = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuMounted, menuPhase, closeMenu]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <div className="lo-kebab" ref={ref}>
      <button
        type="button"
        onClick={() => (menuPhase === 'closed' || menuPhase === 'exit' ? openMenu() : closeMenu())}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500"
        aria-label="More actions"
        aria-expanded={menuPhase === 'enter'}
      >
        <MoreVertical size={18} />
      </button>
      {menuMounted && (
        <div className={`lo-kebab-menu lo-pop-${menuPhase} ${menuPhase === 'exit' ? 'pointer-events-none' : ''}`}>
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                closeMenu();
                item.onClick?.();
              }}
              className={`lo-kebab-item ${item.danger ? 'lo-kebab-item--danger' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {item.icon && <item.icon size={13} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpandableListCard({ summary, details, leading, actions = [], footer, className = '', onToggleExpand }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const menuItems = [
    { icon: Eye, label: 'View more', onClick: () => { setDetailsOpen(true); onToggleExpand?.(); } },
    ...actions,
  ];

  return (
    <article className={`lo-list-card min-w-0 p-3 ${className}`}>
      <div className="flex items-start gap-2">
        {leading}
        <div className="min-w-0 flex-1">{summary}</div>
        <KebabMenu items={menuItems} />
      </div>
      {footer}
      <AnimatedPopup open={detailsOpen}>
        {detailsOpen && (
            <section role="dialog" aria-modal="true" aria-label="List item details" className="lo-dialog-card max-h-[80dvh] w-full max-w-sm overflow-y-auto p-4">
              <header className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900">Details</h2>
                <button type="button" onClick={() => setDetailsOpen(false)} aria-label="Close details" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500">
                  <X size={18} />
                </button>
              </header>
              <div className="mb-3">{summary}</div>
              <div className="border-t border-slate-200 pt-3">{details}</div>
            </section>
        )}
      </AnimatedPopup>
    </article>
  );
}

/**
 * Search + sort bar for list tabs.
 */
export function SearchSortBar({
  search,
  onSearchChange,
  sortField,
  sortDir,
  onSortToggle,
  fields = [],
  placeholder = 'Search…',
}) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const currentField = fields[fieldIdx];

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600/25"
      />
      {fields.length > 0 && (
        <button
          type="button"
          onClick={() => {
            if (sortField === currentField) {
              onSortToggle(sortField, sortDir === 'asc' ? 'desc' : 'asc');
            } else {
              onSortToggle(currentField, 'asc');
            }
            setFieldIdx((i) => (i + 1) % fields.length);
          }}
          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-900  "
          title={`Sort by ${currentField}`}
        >
          <ArrowUpDown size={12} />
          {sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        </button>
      )}
    </div>
  );
}

/**
 * Confirmation toast component.
 */
export function ConfirmToast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(onClose, 3000);
    return () => clearTimeout(id);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="lo-toast pointer-events-none fixed left-1/2 top-20 z-[2000] -translate-x-1/2 rounded-full border border-emerald-500 bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-xl backdrop-blur">
      ✓ {message}
    </div>
  );
}
