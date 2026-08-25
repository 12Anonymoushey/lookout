import { Bus, Users } from 'lucide-react';
import PulseDot from './PulseDot.jsx';

const TABS = [
  { id: 'commuter', label: 'Commuter', icon: Users },
  { id: 'driver', label: 'Driver', icon: Bus },
];

/** Top navigation bar: brand, Commuter/Driver switcher, live-server pill. */
export default function Navbar({ view, onViewChange, connected }) {
  return (
    <header className="z-[1100] flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 px-3 backdrop-blur sm:px-5">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-2 shadow-lg shadow-cyan-500/25">
          <Bus size={20} className="text-white" />
        </div>
        <div className="leading-tight">
          <h1 className="text-base font-extrabold tracking-tight sm:text-lg">Look Out!</h1>
          <p className="hidden text-[11px] text-slate-400 sm:block">
            Iloilo City PUV Live Tracker · LPTRP Routes
          </p>
        </div>
      </div>

      {/* View switcher */}
      <nav className="flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-800/60 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewChange(id)}
            aria-pressed={view === id}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
              view === id
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Connection status */}
      <div
        className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider md:flex ${
          connected
            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-400/40 bg-rose-500/10 text-rose-300'
        }`}
      >
        <PulseDot color={connected ? 'emerald' : 'rose'} />
        {connected ? 'Live server' : 'Server offline'}
      </div>
    </header>
  );
}
