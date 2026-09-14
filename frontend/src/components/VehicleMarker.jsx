import { useMemo } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import { Bus, Check, Hand, Loader2, Users } from 'lucide-react';
import { etaMinutes, formatEta, formatKm, haversineKm } from '../utils/geo.js';
import { statusColor, statusMeta } from '../utils/vehicle.js';

const sanitizeLabel = (value) =>
  String(value ?? '').replace(/[&<>"'/\\]/g, '').trim().slice(0, 12) || 'PUV';

export default function VehicleMarker({ vehicle, route, onPoke, pokeState = 'idle' }) {
  const routeColor = route?.color || '#FF69B4';
  const meta = statusMeta(vehicle);
  const body = statusColor(vehicle);

  const icon = useMemo(() => {
    const heading = Math.round(Number(vehicle.heading) || 0);
    const label = sanitizeLabel(vehicle.vehicleId);
    const html = `
      <div class="lo-marker" style="--lo:${routeColor}">
        <span class="lo-marker__ring"></span>
        <div class="lo-marker__body" style="transform: rotate(${heading}deg)">
          <svg width="30" height="30" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <rect x="7" y="3" width="18" height="26" rx="5" fill="${body}" stroke="#0e0a18" stroke-width="2"/>
            <rect x="10" y="7" width="12" height="6" rx="1.5" fill="#0e0a18" opacity="0.85"/>
            <rect x="10.5" y="19" width="11" height="3" rx="1.5" fill="#0e0a18" opacity="0.55"/>
            <circle cx="5.5" cy="10" r="2.2" fill="#0e0a18"/>
            <circle cx="26.5" cy="10" r="2.2" fill="#0e0a18"/>
            <circle cx="5.5" cy="22" r="2.2" fill="#0e0a18"/>
            <circle cx="26.5" cy="22" r="2.2" fill="#0e0a18"/>
          </svg>
        </div>
        <span class="lo-marker__label" style="box-shadow: inset 0 0 0 1px ${meta.color}">${label}</span>
      </div>`;

    return L.divIcon({
      className: 'lo-icon-wrapper',
      html,
      iconSize: [44, 52],
      iconAnchor: [22, 26],
      popupAnchor: [0, -26],
    });
  }, [vehicle.heading, vehicle.vehicleId, routeColor, body, meta.color]);

  const nextInfo = useMemo(() => {
    if (!route?.stops?.length) return null;
    let best = null;
    for (const stop of route.stops) {
      const km = haversineKm(vehicle.lat, vehicle.lng, stop.lat, stop.lng);
      if (!best || km < best.km) best = { stop, km };
    }
    return { ...best, etaMin: etaMinutes(best.km, vehicle.speed) };
  }, [route, vehicle.lat, vehicle.lng, vehicle.speed]);

  return (
    <Marker position={[vehicle.lat, vehicle.lng]} icon={icon} zIndexOffset={500}>
      <Popup maxWidth={300}>
        <div className="min-w-[230px] space-y-2 font-sans">
          <div className="flex items-center justify-between gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: `${routeColor}26`, color: routeColor }}
            >
              <Bus size={12} /> {vehicle.vehicleId}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--lo-pink)' }}>● Live</span>
          </div>

          <p className="text-sm font-semibold text-[#f0e6f6]">{route?.name ?? 'Unknown route'}</p>

          <p
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold"
            style={{ backgroundColor: meta.soft, color: meta.color }}
          >
            <Users size={12} /> {meta.long}
          </p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-[#8a7098]">Speed</dt>
            <dd className="text-right font-mono text-[#e0d4ec]">{(Number(vehicle.speed) || 0).toFixed(1)} km/h</dd>
            <dt className="text-[#8a7098]">Next stop</dt>
            <dd className="truncate text-right text-[#e0d4ec]">{nextInfo?.stop.name ?? '—'}</dd>
            <dt className="text-[#8a7098]">Distance</dt>
            <dd className="text-right text-[#e0d4ec]">{formatKm(nextInfo?.km)}</dd>
            <dt className="text-[#8a7098]">ETA</dt>
            <dd className="text-right font-bold" style={{ color: 'var(--lo-pink)' }}>{formatEta(nextInfo?.etaMin)}</dd>
          </dl>

          {onPoke && (
            <button
              type="button"
              onClick={() => onPoke(vehicle)}
              disabled={pokeState !== 'idle'}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                pokeState === 'sent'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-white hover:opacity-90'
              } disabled:cursor-default`}
              style={pokeState !== 'sent' ? { background: 'var(--lo-pink)' } : undefined}
            >
              {pokeState === 'sending' && <Loader2 size={13} className="animate-spin" />}
              {pokeState === 'sent' && <Check size={13} />}
              {pokeState === 'idle' && <Hand size={13} />}
              {pokeState === 'sent' ? 'Poked!' : 'Poke'}
            </button>
          )}

          <p className="text-[10px] text-[#8a7098]">
            Last fix: {new Date(vehicle.updatedAt).toLocaleTimeString()}
          </p>
        </div>
      </Popup>
    </Marker>
  );
}
