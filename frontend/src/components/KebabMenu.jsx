import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Pencil, Trash2, Eye, Plus, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';

/**
 * Three-dot kebab menu with actions. Click outside to close.
 */
export function KebabMenu({ items = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onAway = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onAway);
    return () => document.removeEventListener('mousedown', onAway);
  }, [open]);

  return (
    <div className="lo-kebab" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1 text-[#8a7098] transition hover:bg-[#3a2a50] hover:text-[#d8c8e8]"
        aria-label="More actions"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="lo-kebab-menu">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              className={`lo-kebab-item ${item.danger ? 'lo-kebab-item--danger' : ''}`}
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
        className="flex-1 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 text-xs text-[#f0e6f6] placeholder:text-[#6a5a7a] focus:border-[var(--lo-pink)] focus:outline-none focus:ring-1 focus:ring-[#FF69B4]/25"
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
          className="flex items-center gap-1 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-2.5 py-2 text-[10px] font-bold text-[#d8c8e8] transition hover:border-[var(--lo-pink)]/50"
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
    <div className="lo-toast pointer-events-none fixed left-1/2 top-20 z-[2000] -translate-x-1/2 rounded-full border border-emerald-400/50 bg-[var(--lo-panel)] px-4 py-2 text-xs font-bold text-emerald-300 shadow-xl backdrop-blur">
      ✓ {message}
    </div>
  );
}
