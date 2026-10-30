const COLOR_CLASSES = {
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  blue: 'bg-blue-600',
  slate: 'bg-slate-500',
};

export default function PulseDot({ color = 'emerald' }) {
  const dotClass = COLOR_CLASSES[color] ?? COLOR_CLASSES.emerald;
  return (
    <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
  );
}
