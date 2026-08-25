import { useMemo } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import { Bus } from 'lucide-react';
import { etaMinutes, formatEta, formatKm, haversineKm } from '../utils/geo.js';

/** Strip characters that could break the DivIcon HTML template. */
const sanitizeLabel = (value) =>
  String(value ?? '')
    .replace(/[&<>"'/\\]/g, '')
    .trim()
    .slice(0, 12) || 'PUV';

/**
 * Live vehicle marker:
 *  - Leaflet DivIcon with a custom top-view SVG jeepney
 *  - rotated by the reported heading, ring pulse in the route color
 *  - Tailwind-styled popup: ID, route, speed, nearest stop + Haversine ETA
 */
export default function VehicleMarker({ vehicle, route }) {
  const color = route?.color || '#22d3ee';

  const icon = useMemo(() => {
    const heading = Math.round(Number(vehicle.heading) || 0);
    const label = sanitizeLabel(vehicle.vehicleId);
    const html = `
      <div class="lo-marker" style="--lo:${color}">
        <span class="lo-marker__ring"></span>
        <div class="lo-marker__body" style="transform: rotate(${heading}deg)">
          <svg width="30" height="30" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <rect x="7" y="3" width="18" height="26" rx="5" fill="${color}" stroke="#020617" stroke-width="2"/>
            <rect x="10" y="7" width="12" height="6" rx="1.5" fill="#020617" opacity="0.85"/>
            <rect x="10.5" y="19" width="11" height="3" rx="1.5" fill="#020617" opacity="0.55"/>
            <circle cx="5.5" cy="10" r="2.2" fill="#020617"/>
            <circle cx="26.5" cy="10" r="2.2" fill="#020617"/>
            <circle cx="5.5" cy="22" r="2.2" fill="#020617"/>
            <circle cx="26.5" cy="22" r="2.2" fill="#020617"/>
          </svg>
        </div>
        <span class="lo-marker__label">${label}</span>
      </div>`;

    return L.divIcon({
      className: 'lo-icon-wrapper',
      html,
      iconSize: [44, 52],
      iconAnchor: [22, 26],
      popupAnchor: [0, -26],
    });
  }, [vehicle.heading, vehicle.vehicleId, color]);

  // Nearest stop counts as "the stop it is approaching".
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
      <Popup maxWidth={290}>
        <div className="min-w-[220px] space-y-2 font-sans">
          <div className="flex items-center justify-between gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: `${color}26`, color }}
            >
              <Bus size={12} />
              {vehicle.vehicleId}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              ● Live
            </span>
          </div>

          <p className="text-sm font-semibold text-slate-100">
            {route?.name ?? 'Unregistered route'}
          </p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-slate-400">Speed</dt>
            <dd className="text-right font-mono text-slate-100">
              {(Number(vehicle.speed) || 0).toFixed(1)} km/h
            </dd>
            <dt className="text-slate-400">Next stop</dt>
            <dd className="truncate text-right text-slate-100">{nextInfo?.stop.name ?? '—'}</dd>
            <dt className="text-slate-400">Distance</dt>
            <dd className="text-right text-slate-100">{formatKm(nextInfo?.km)}</dd>
            <dt className="text-slate-400">ETA</dt>
            <dd className="text-right font-bold text-cyan-300">{formatEta(nextInfo?.etaMin)}</dd>
          </dl>

          <p className="text-[10px] text-slate-500">
            Last fix: {new Date(vehicle.updatedAt).toLocaleTimeString()}
          </p>
        </div>
      </Popup>
    </Marker>
  );
}
