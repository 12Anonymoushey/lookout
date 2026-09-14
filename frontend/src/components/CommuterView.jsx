import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import {
  Banknote,
  Check,
  ChevronDown,
  Hand,
  Loader2,
  LocateFixed,
  MapPin,
  Radio,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import AppShell, { InfoRow, Section } from './AppShell.jsx';
import PulseDot from './PulseDot.jsx';
import VehicleMarker from './VehicleMarker.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sendPoke } from '../services/pokeService.js';
import { statusMeta } from '../utils/vehicle.js';
import {
  etaMinutes,
  formatEta,
  formatKm,
  haversineKm,
  loopPositions,
} from '../utils/geo.js';

const ILOILO_CENTER = [10.7202, 122.5621];
const FRESH_WINDOW_MS = 90_000; // vehicles silent for >90 s are ignored
const POKE_RANGE_KM = 4; // only "the jeepney about to reach you" can be poked
const POKE_COOLDOWN_MS = 6_000;

/** Custom DivIcon for the commuter's own position. */
const meIcon = L.divIcon({
  className: 'lo-me-wrapper',
  html: `<div class="lo-me"><span class="lo-me__halo"></span><span class="lo-me__dot"></span><span class="lo-me__label">You are here</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/** The tappable "Poke" speech bubble that pops above the approaching jeepney. */
const pokeIcon = (sent) =>
  L.divIcon({
    className: 'lo-poke-wrapper',
    html: `<div class="lo-poke__bob"><span class="lo-poke ${sent ? 'lo-poke--sent' : ''}">${
      sent ? '✓ Poked!' : '👋 Poke'
    }</span></div>`,
    iconSize: [104, 34],
    iconAnchor: [52, 62],
  });

/**
 * COMMUTER VIEW
 *  • sidebar (desktop) / burger drawer (mobile) → my details, fleet filter, fares
 *  • a slim one-line bar stays over the map so the map is never buried
 *  • live markers, "You are here", stop ETAs and the one-tap POKE bubble
 */
export default function CommuterView({
  routes,
  vehicles,
  hasFetchError = false,
  drawerOpen,
  onCloseDrawer,
  collapsed,
  onToggleCollapse,
}) {
  const { profile, role } = useAuth();
  const [routeFilter, setRouteFilter] = useState('all');
  const [selectedStop, setSelectedStop] = useState(null);
  const [, setTick] = useState(0); // re-render heartbeat so stale markers vanish
  const [myLocation, setMyLocation] = useState(null);
  const [locState, setLocState] = useState('idle'); // idle|locating|locked|denied|unsupported
  const [pokes, setPokes] = useState({}); // { [vehicleId]: { state, at } }
  const [toast, setToast] = useState('');
  const mapRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  /* --------------- the commuter's own live position on the map ------------- */
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocState('unsupported');
      return undefined;
    }
    setLocState('locating');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          at: pos.timestamp,
        });
        setLocState('locked');
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
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

  /* -------------------- vehicles approaching the tapped stop --------------- */
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

  /* ------------------------- the poke target jeepney ----------------------- */
  // "The bus that's about to arrive at her point": nearest live jeepney to the
  // commuter's own position (or to the stop she tapped), within walking range.
  const pokeAnchor =
    myLocation ?? (selectedStop ? { lat: selectedStop.lat, lng: selectedStop.lng } : null);

  const pokeTarget = useMemo(() => {
    if (!pokeAnchor) return null;
    let best = null;
    for (const vehicle of visibleVehicles) {
      const km = haversineKm(pokeAnchor.lat, pokeAnchor.lng, vehicle.lat, vehicle.lng);
      if (!best || km < best.km) best = { vehicle, km };
    }
    return best && best.km <= POKE_RANGE_KM ? best.vehicle : null;
  }, [visibleVehicles, pokeAnchor]);

  const pokeStateOf = useCallback(
    (vehicleId) => {
      const entry = pokes[vehicleId];
      if (!entry) return 'idle';
      if (entry.state === 'sent' && Date.now() - entry.at > POKE_COOLDOWN_MS) return 'idle';
      return entry.state;
    },
    [pokes],
  );

  const pokesSent = useMemo(
    () => Object.values(pokes).filter((entry) => entry.state === 'sent').length,
    [pokes],
  );

  const handlePoke = useCallback(
    async (vehicle) => {
      const vehicleId = vehicle?.vehicleId;
      if (!vehicleId || pokeStateOf(vehicleId) !== 'idle') return;

      setPokes((prev) => ({ ...prev, [vehicleId]: { state: 'sending', at: Date.now() } }));
      try {
        const via = await sendPoke({
          toPlate: vehicleId,
          fromName: profile?.fullName || 'A commuter',
          message: 'Poke! 👋',
          lat: myLocation?.lat ?? selectedStop?.lat ?? null,
          lng: myLocation?.lng ?? selectedStop?.lng ?? null,
          routeId: vehicle.routeId ?? null,
        });
        setPokes((prev) => ({ ...prev, [vehicleId]: { state: 'sent', at: Date.now() } }));
        setToast(`Poke sent to ${vehicleId}! 👋${via === 'socket' ? ' (live server)' : ''}`);
      } catch (err) {
        console.warn('[Look Out!] poke failed:', err);
        setPokes((prev) => ({ ...prev, [vehicleId]: { state: 'idle', at: Date.now() } }));
        setToast('Could not send the poke — check your connection.');
      }
    },
    [myLocation, pokeStateOf, profile, selectedStop],
  );

  // Auto-dismiss the poke toast.
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const handleFilterChange = (value) => {
    setRouteFilter(value);
    setSelectedStop(null); // previous stop may belong to another route
  };

  const recenter = () => {
    if (myLocation) mapRef.current?.flyTo([myLocation.lat, myLocation.lng], 16, { duration: 0.8 });
    else mapRef.current?.flyTo(ILOILO_CENTER, 14, { duration: 0.8 });
  };

  const routePositions = focusRoute
    ? focusRoute.loop
      ? loopPositions(focusRoute.stops)
      : focusRoute.stops.map((s) => [s.lat, s.lng])
    : [];

  const locBadge =
    locState === 'locked'
      ? `±${Math.round(myLocation?.accuracy ?? 0)} m`
      : locState === 'locating'
        ? 'locating…'
        : locState === 'denied'
          ? 'location off'
          : 'unavailable';

  /* -------------------------------- sidebar -------------------------------- */
  const panel = (
    <>
      <Section icon={UserRound} title="My details" tint="cyan">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Mobile" value={profile?.phone || '—'} />
        <InfoRow label="Account" value={role ?? 'commuter'} />
        <InfoRow label="Pokes sent" value={pokesSent} />
      </Section>

      <Section icon={SlidersHorizontal} title="Live fleet" tint="emerald">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Filter by route
          </span>
          <span className="relative block">
            <select
              value={routeFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 pr-8 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
            >
              <option value="all">All routes</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} · {route.stops.length} stops
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </span>
        </label>

        <InfoRow label="Live vehicles" value={visibleVehicles.length} />
        <InfoRow label="My point" value={locBadge} />

        <button
          type="button"
          onClick={recenter}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-[11px] font-bold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
        >
          <LocateFixed size={12} /> {myLocation ? 'Center on my point' : 'Recenter on Iloilo City'}
        </button>

        <p className="text-[10px] leading-relaxed text-slate-500">
          {myLocation
            ? 'Tap the jeepney coming your way to poke its driver.'
            : 'Allow location access to mark your exact point on the map, or tap a stop to use it as your point.'}
        </p>
      </Section>

      {focusRoute && (
        <Section icon={Banknote} title="Fare table" tint="emerald">
          <p className="text-[10px] leading-relaxed text-slate-400">
            ₱{focusRoute.fareStructure.baseFare} first {focusRoute.fareStructure.baseDistanceKm} km,
            then +₱{focusRoute.fareStructure.additionalPerKm}/km · 20% off for students, seniors and
            PWDs.
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {focusRoute.fareMatrix.map((leg) => (
              <li
                key={`${leg.from}-${leg.to}`}
                className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-2 py-1.5"
              >
                <p className="truncate text-[10px] text-slate-300">
                  {leg.from} → {leg.to}
                </p>
                <p className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-slate-400">
                  <span>{leg.km} km</span>
                  <span className="font-bold text-emerald-300">
                    ₱{leg.regular} <span className="text-slate-500">/ ₱{leg.discounted}</span>
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={Hand} title="How to poke" defaultOpen={false} tint="blue">
        <p className="text-[10px] leading-relaxed text-slate-400">
          1. Pick the route the jeepney is plying.
          <br />
          2. Tap its 👋 <span className="font-bold text-cyan-300">Poke</span> bubble on the map (or
          the Poke button on any jeepney in the approaching list).
          <br />
          3. The driver&rsquo;s console counts it instantly — poke once per jeepney.
        </p>
      </Section>
    </>
  );

  /* --------------------------------- stage --------------------------------- */
  return (
    <AppShell
      brand="Commuter"
      panel={panel}
      open={drawerOpen}
      onCloseDrawer={onCloseDrawer}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
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

          {/* The commuter's own point on the map */}
          {myLocation && (
            <>
              {myLocation.accuracy > 0 && myLocation.accuracy < 500 && (
                <Circle
                  center={[myLocation.lat, myLocation.lng]}
                  radius={myLocation.accuracy}
                  pathOptions={{
                    color: '#22d3ee',
                    weight: 1,
                    fillColor: '#22d3ee',
                    fillOpacity: 0.08,
                  }}
                />
              )}
              <Marker
                position={[myLocation.lat, myLocation.lng]}
                icon={meIcon}
                zIndexOffset={400}
              />
            </>
          )}

          {/* Live fleet markers */}
          {visibleVehicles.map((vehicle) => (
            <VehicleMarker
              key={vehicle.vehicleId}
              vehicle={vehicle}
              route={routeById[vehicle.routeId] ?? null}
              onPoke={handlePoke}
              pokeState={pokeStateOf(vehicle.vehicleId)}
            />
          ))}

          {/* The tappable "Poke" bubble over the jeepney about to reach her */}
          {pokeTarget && (
            <Marker
              position={[pokeTarget.lat, pokeTarget.lng]}
              icon={pokeIcon(pokeStateOf(pokeTarget.vehicleId) !== 'idle')}
              zIndexOffset={900}
              eventHandlers={{ click: () => handlePoke(pokeTarget) }}
            />
          )}
        </MapContainer>

        {/* ------------------- slim live bar (never buries the map) ------------------ */}
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-[1000] flex flex-wrap items-center gap-2 lg:left-3 lg:top-3">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/90 pl-3 pr-1.5 shadow-xl backdrop-blur">
            <span className="flex shrink-0 items-center gap-1.5">
              <PulseDot color="emerald" />
              <span className="text-[11px] font-bold text-emerald-300">
                {visibleVehicles.length} live
              </span>
            </span>
            <span className="h-4 w-px shrink-0 bg-slate-700" />
            <label className="relative flex min-w-0 flex-1 items-center lg:w-52 lg:flex-none">
              <select
                value={routeFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
                aria-label="Filter by route"
                className="w-full appearance-none truncate rounded-full bg-transparent py-1 pl-1 pr-5 text-[11px] font-semibold text-slate-100 focus:outline-none"
              >
                <option value="all">All routes</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-1 text-slate-400"
              />
            </label>
            <button
              type="button"
              onClick={recenter}
              title={myLocation ? 'Center on my point' : 'Recenter on Iloilo City'}
              aria-label="Center on my point"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-cyan-300"
            >
              {myLocation ? <LocateFixed size={13} /> : <MapPin size={13} />}
            </button>
          </div>

          {focusRoute && !selectedStop && (
            <span className="pointer-events-none hidden items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-900/85 px-3 py-2 text-[10px] font-semibold text-slate-300 backdrop-blur sm:flex">
              <MapPin size={11} className="text-cyan-300" /> Tap a stop for ETAs, then poke the
              jeepney heading your way
            </span>
          )}
        </div>

        {/* ------------------ approaching vehicles panel ------------------ */}
        {selectedStop && (
          <div className="absolute bottom-16 left-2 right-2 z-[1000] rounded-2xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-xl backdrop-blur sm:bottom-4 sm:left-auto sm:right-4 sm:w-96">
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
                {approaching.map(({ vehicle, km, etaMin }) => {
                  const meta = statusMeta(vehicle);
                  const state = pokeStateOf(vehicle.vehicleId);
                  return (
                    <li
                      key={vehicle.vehicleId}
                      className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
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
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: meta.soft, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePoke(vehicle)}
                          disabled={state !== 'idle'}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                            state === 'sent'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                          } disabled:cursor-default`}
                        >
                          {state === 'sending' ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : state === 'sent' ? (
                            <Check size={11} />
                          ) : (
                            <Hand size={11} />
                          )}
                          {state === 'sent' ? 'Poked' : 'Poke'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Poke feedback toast */}
        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-14 z-[1100] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-cyan-400/50 bg-slate-900/95 px-4 py-2 text-xs font-bold text-cyan-200 shadow-xl backdrop-blur">
            {toast}
          </div>
        )}

        {/* Empty-state hint */}
        {vehicles.length === 0 && !hasFetchError && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] w-[min(90vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-5 text-center shadow-xl backdrop-blur">
            <Radio size={24} className="mx-auto mb-2 animate-pulse text-cyan-400" />
            <p className="text-sm font-semibold">No live vehicles yet</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Open the <span className="font-bold text-cyan-300">Driver</span> view in another
              window, start a trip (or the GPS simulator) and the jeep appears here in real time.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
