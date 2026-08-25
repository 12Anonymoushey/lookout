import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { Banknote, ChevronDown, Crosshair, Filter, MapPin, Radio, X } from 'lucide-react';
import PulseDot from './PulseDot.jsx';
import VehicleMarker from './VehicleMarker.jsx';
import {
  etaMinutes,
  formatEta,
  formatKm,
  haversineKm,
  loopPositions,
} from '../utils/geo.js';

const ILOILO_CENTER = [10.7202, 122.5621];
const FRESH_WINDOW_MS = 90_000; // vehicles silent for >90 s are ignored

/**
 * COMMUTER VIEW
 * Fullscreen Leaflet map of Iloilo City fed by Socket.IO fleet events,
 * with a route filter, clickable stops and an "approaching vehicles" panel
 * powered by Haversine distance + speed-based ETA.
 */
export default function CommuterView({ routes, vehicles, hasFetchError = false }) {
  const [routeFilter, setRouteFilter] = useState('all');
  const [selectedStop, setSelectedStop] = useState(null);
  const [, setTick] = useState(0); // re-render heartbeat so stale markers vanish
  const mapRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const routeById = useMemo(
    () => Object.fromEntries(routes.map((r) => [r.id, r])),
    [routes],
  );

  const visibleVehicles = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          Date.now() - (v.updatedAt ?? 0) < FRESH_WINDOW_MS &&
          (routeFilter === 'all' || v.routeId === routeFilter),
      ),
    [vehicles, routeFilter],
  );

  const focusRoute = routeFilter === 'all' ? null : routeById[routeFilter] ?? null;

  // Vehicles approaching the tapped stop, nearest first (Haversine + ETA).
  const approaching = useMemo(() => {
    if (!selectedStop) return [];
    return visibleVehicles
      .map((v) => ({
        vehicle: v,
        km: haversineKm(selectedStop.lat, selectedStop.lng, v.lat, v.lng),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8)
      .map(({ vehicle, km }) => ({
        vehicle,
        km,
        etaMin: etaMinutes(km, vehicle.speed),
      }));
  }, [visibleVehicles, selectedStop]);

  const handleFilterChange = (value) => {
    setRouteFilter(value);
    setSelectedStop(null); // previous stop may belong to another route
  };

  const recenter = () => {
    mapRef.current?.flyTo(ILOILO_CENTER, 14, { duration: 0.8 });
  };

  const routePositions = focusRoute
    ? focusRoute.loop
      ? loopPositions(focusRoute.stops)
      : focusRoute.stops.map((s) => [s.lat, s.lng])
    : [];

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={ILOILO_CENTER}
        zoom={14}
        className="h-full w-full"
        zoomControl={false}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Selected route: path polyline + clickable stop markers */}
        {focusRoute && (
          <>
            <Polyline
              positions={routePositions}
              color={focusRoute.color}
              weight={4}
              opacity={0.7}
              dashArray={focusRoute.loop ? '8 10' : undefined}
            />
            {focusRoute.stops.map((stop) => (
              <CircleMarker
                key={stop.id}
                center={[stop.lat, stop.lng]}
                radius={7}
                pathOptions={{
                  color: '#020617',
                  weight: 2,
                  fillColor: focusRoute.color,
                  fillOpacity: 1,
                }}
                eventHandlers={{ click: () => setSelectedStop(stop) }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  {stop.name}
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        )}

        {/* Live fleet markers */}
        {visibleVehicles.map((vehicle) => (
          <VehicleMarker
            key={vehicle.vehicleId}
            vehicle={vehicle}
            route={routeById[vehicle.routeId] ?? null}
          />
        ))}
      </MapContainer>

      {/* ------------------- floating control card (top-left) ------------------- */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-[1000] flex flex-col gap-3 sm:left-4 sm:right-auto sm:w-80">
        <div className="pointer-events-auto space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-4 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Filter size={15} className="text-cyan-400" /> Live Fleet
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300">
              <PulseDot color="emerald" />
              {visibleVehicles.length} live
            </span>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Filter by route
            </span>
            <span className="relative block">
              <select
                value={routeFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 pr-9 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                <option value="all">All routes</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name} · {route.stops.length} stops
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </span>
          </label>

          {focusRoute ? (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
              <Banknote size={13} className="mt-0.5 shrink-0 text-emerald-400" />
              Base fare ₱{focusRoute.fareStructure.baseFare} first{' '}
              {focusRoute.fareStructure.baseDistanceKm} km, +₱
              {focusRoute.fareStructure.additionalPerKm}/km — tap any stop marker for approaching
              jeeps.
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-slate-400">
              Pick a route to draw its path and stops on the map.
            </p>
          )}
        </div>
      </div>

      {/* ------------------ approaching vehicles panel ------------------ */}
      {selectedStop && (
        <div className="absolute bottom-16 left-3 right-3 z-[1000] rounded-2xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-xl backdrop-blur sm:bottom-4 sm:left-4 sm:right-auto sm:w-96">
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <MapPin size={14} style={{ color: focusRoute?.color ?? '#22d3ee' }} />
                {selectedStop.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                Approaching · {focusRoute?.name ?? ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStop(null)}
              aria-label="Close panel"
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              <X size={15} />
            </button>
          </div>

          {approaching.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-500">
              No live vehicles on this route yet.
            </p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {approaching.map(({ vehicle, km, etaMin }) => (
                <li
                  key={vehicle.vehicleId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-100">
                      {vehicle.vehicleId}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {(Number(vehicle.speed) || 0).toFixed(0)} km/h · {formatKm(km)} away
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-cyan-500/15 px-2 py-1 text-[11px] font-bold text-cyan-300">
                    {formatEta(etaMin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recenter button */}
      <button
        type="button"
        onClick={recenter}
        title="Recenter on Iloilo City"
        className="absolute bottom-16 right-3 z-[1000] flex h-11 w-11 items-center justify-center rounded-full border border-slate-600 bg-slate-900/90 text-slate-200 shadow-xl backdrop-blur transition hover:border-cyan-400 hover:text-cyan-300 sm:bottom-4 sm:right-4"
      >
        <Crosshair size={17} />
      </button>

      {/* Empty-state hint */}
      {vehicles.length === 0 && !hasFetchError && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] w-[min(90vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-5 text-center shadow-xl backdrop-blur">
          <Radio size={26} className="mx-auto mb-2 animate-pulse text-cyan-400" />
          <p className="text-sm font-semibold">No live vehicles yet</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Switch to the <span className="font-bold text-cyan-300">Driver</span> tab (open it in a
            second window), start a trip or enable the GPS simulator, then watch the jeep appear
            here in real time.
          </p>
        </div>
      )}
    </div>
  );
}
