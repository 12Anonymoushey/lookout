/** Compact dashboard metric card used across views (dark slate style). */
export default function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {Icon ? <Icon size={13} /> : null}
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-lg font-semibold text-slate-100">{value}</div>
      {hint ? <div className="text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
