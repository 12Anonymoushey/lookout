/**
 * Small status indicator: a solid dot wrapped in an animated "ping" halo.
 * Colors map onto Tailwind palette names.
 */
const COLOR_CLASSES = {
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
  amber: 'bg-amber-400',
  cyan: 'bg-cyan-400',
  slate: 'bg-slate-400',
};

export default function PulseDot({ color = 'emerald' }) {
  const dotClass = COLOR_CLASSES[color] ?? COLOR_CLASSES.emerald;
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotClass}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
    </span>
  );
}
