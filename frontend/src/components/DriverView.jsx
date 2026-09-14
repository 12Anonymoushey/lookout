import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, TileLayer } from 'react-leaflet';
import {
  AlertTriangle,
  Bus,
  Check,
  ChevronDown,
  Crosshair,
  Loader2,
  Play,
  Satellite,
  Send,
  Square,
  Timer,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { socket } from '../services/socket.js';
import { bearingDeg, cardinal, haversineKm, pathLengthKm, pointAtDistance } from '../utils/geo.js';
import { useAuth } from '../context/AuthContext.jsx';
import AppShell, { InfoRow, Section } from './AppShell.jsx';
import PlateManager from './PlateManager.jsx';
import DriverPokes from './DriverPokes.jsx';
import PulseDot from './PulseDot.jsx';
import VehicleMarker from './VehicleMarker.jsx';

const ILOILO_CENTER = [10.7202, 122.5621];
const TICK_MS = 3000; // broadcast cadence required by the spec

const fmtCoord = (n) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toFixed(6));
const fmtDuration = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * DRIVER VIEW
 * The console (plates, trip controls, GPS telemetry, passenger status) lives in
 * the sidebar on desktop and in the burger drawer on phones, so the map keeps
 * the whole stage. The two passenger-status buttons and the live POKE counter
 * stay pinned to the bottom-right corner exactly as specified.
 */
export default function DriverView({
  routes,
  connected,
  drawerOpen,
  onCloseDrawer,
  collapsed,
  onToggleCollapse,
}) {
  const { profile, plates, activePlate, setPlates, setActivePlate } = useAuth();

  const [routeId, setRouteId] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [simEnabled, setSimEnabled] = useState(false);
  const [telemetry, setTelemetry] = useState({ lat: null, lng: null, speed: 0, heading: 0 });
  const [accuracy, setAccuracy] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | acquiring | locked | denied
  const [sentCount, setSentCount] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);
  const [full, setFull] = useState(false); // ← the "Full / Still Vacant" switch

  // Refs hold values needed inside interval/watch callbacks without stale closures.
  const watchIdRef = useRef(null);
  const tickRef = useRef(null);
  const latestFixRef = useRef(null);
  const simRef = useRef({ travelledKm: 0 });
  const metaRef = useRef(null); // { vehicleId, routeId }
  const simFlagRef = useRef(false);
  const isLiveRef = useRef(false);
  const fullRef = useRef(false);
  const routesRef = useRef(routes);
  const routeIdRef = useRef(routeId);
  const miniMapRef = useRef(null);

  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    routeIdRef.current = routeId;
  }, [routeId]);

  useEffect(() => {
    fullRef.current = full;
  }, [full]);

  // Pre-select the first route once the catalogue arrives.
  useEffect(() => {
    if (!routeId && routes.length > 0) setRouteId(routes[0].id);
  }, [routes, routeId]);

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === routeId) ?? null,
    [routes, routeId],
  );

  const pushFix = useCallback((fix) => {
    latestFixRef.current = fix;
    setTelemetry({ lat: fix.lat, lng: fix.lng, speed: fix.speed, heading: fix.heading });
  }, []);

  const startGeoWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('denied');
      setError('This browser does not support geolocation. Use the GPS simulator instead.');
      return;
    }
    setGpsStatus('acquiring');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const prev = latestFixRef.current;

        // Prefer device-reported speed (m/s -> km/h), else derive from movement.
        let speedKmh = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : 0;
        if ((!speedKmh || speedKmh < 0) && prev) {
          const dtSec = (pos.timestamp - prev.timestamp) / 1000;
          if (dtSec > 0.5) {
            speedKmh = (haversineKm(prev.lat, prev.lng, c.latitude, c.longitude) / dtSec) * 3600;
          }
        }

        const heading =
          c.heading != null && !Number.isNaN(c.heading)
            ? c.heading
            : prev
              ? bearingDeg(prev.lat, prev.lng, c.latitude, c.longitude)
              : 0;

        pushFix({
          lat: c.latitude,
          lng: c.longitude,
          speed: Math.max(0, speedKmh),
          heading,
          timestamp: pos.timestamp,
        });
        setAccuracy(c.accuracy ?? null);
        setGpsStatus('locked');
        setError('');
      },
      (err) => {
        setGpsStatus('denied');
        setError(
          `${err.message}. Tip: allow location access, or switch on "Simulate GPS Movement".`,
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, [pushFix]);

  const stopGeoWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const emitFix = useCallback((fix) => {
    const meta = metaRef.current;
    if (!meta) return;
    socket.emit('updateLocation', {
      vehicleId: meta.vehicleId,
      routeId: meta.routeId,
      lat: fix.lat,
      lng: fix.lng,
      speed: Math.round(fix.speed * 10) / 10,
      heading: Math.round(fix.heading),
      full: fullRef.current,
    });
    setSentCount((n) => n + 1);
  }, []);

  /** Every tick: either advance the simulator or rebroadcast the newest GPS fix. */
  const runTick = useCallback(() => {
    if (simFlagRef.current) {
      const route = routesRef.current.find((r) => r.id === routeIdRef.current);
      if (!route || route.stops.length < 2) return;

      const points = route.stops.map((s) => [s.lat, s.lng]);
      const state = simRef.current;
      // Cruise at a plausible 22-35 km/h with gentle variation.
      const speedKmh = 22 + 9 * Math.abs(Math.sin(state.travelledKm * 2.2)) + Math.random() * 4;
      state.travelledKm =
        (state.travelledKm + speedKmh * (TICK_MS / 3_600_000)) % pathLengthKm(points);

      const point = pointAtDistance(points, state.travelledKm);
      if (!point) return;

      const fix = {
        lat: point.lat,
        lng: point.lng,
        speed: Math.max(0, speedKmh + (Math.random() - 0.5) * 4),
        heading: point.bearing,
        timestamp: Date.now(),
      };
      pushFix(fix);
      emitFix(fix);
    } else {
      const fix = latestFixRef.current;
      if (fix) emitFix(fix);
    }
  }, [emitFix, pushFix]);

  const beginTrip = () => {
    const vid = activePlate.trim().toUpperCase();
    if (!vid) {
      setError('Add a plate number first — open "My plate numbers" in the panel.');
      return;
    }
    if (!routeIdRef.current) {
      setError('Select the route you are servicing.');
      return;
    }
    setError('');
    metaRef.current = { vehicleId: vid, routeId: routeIdRef.current };
    isLiveRef.current = true;
    setIsLive(true);
    setStartedAt(Date.now());
    setElapsed(0);
    setSentCount(0);

    if (!simFlagRef.current) startGeoWatch();
    runTick(); // fire one fix immediately, then every TICK_MS
    tickRef.current = setInterval(runTick, TICK_MS);
  };

  const endTrip = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    stopGeoWatch();
    const vid = metaRef.current?.vehicleId;
    if (vid) socket.emit('endTrip', { vehicleId: vid });
    metaRef.current = null;
    isLiveRef.current = false;
    setIsLive(false);
    setStartedAt(null);
    setGpsStatus('idle');
    setAccuracy(null);
  };

  const toggleSim = () => {
    const next = !simFlagRef.current;
    simFlagRef.current = next;
    setSimEnabled(next);
    setError('');
    if (next) {
      stopGeoWatch();
      simRef.current = { travelledKm: 0 }; // restart from the route origin
    } else if (isLiveRef.current) {
      startGeoWatch();
    }
  };

  /** Full / Still Vacant — pushed immediately, then carried by every fix. */
  const setAvailability = useCallback((nextFull) => {
    setFull(nextFull);
    fullRef.current = nextFull;
    const meta = metaRef.current;
    if (meta) socket.emit('setAvailability', { vehicleId: meta.vehicleId, full: nextFull });
  }, []);

  // Trip timer (1 s cadence while broadcasting).
  useEffect(() => {
    if (!isLive) return undefined;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isLive, startedAt]);

  // Auto-pan the preview map while "follow me" is enabled.
  useEffect(() => {
    if (follow && isLive && miniMapRef.current && telemetry.lat != null) {
      miniMapRef.current.setView([telemetry.lat, telemetry.lng], 15, {
        animate: true,
        duration: 0.8,
      });
    }
  }, [follow, isLive, telemetry.lat, telemetry.lng]);

  // Full cleanup on unmount.
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      const vid = metaRef.current?.vehicleId;
      if (vid && isLiveRef.current) socket.emit('endTrip', { vehicleId: vid });
    },
    [],
  );

  const gpsBadge = {
    idle: { icon: Satellite, spin: false, text: 'GPS idle', cls: 'text-slate-400' },
    acquiring: { icon: Loader2, spin: true, text: 'Acquiring signal…', cls: 'text-amber-300' },
    locked: {
      icon: Satellite,
      spin: false,
      text: accuracy ? `GPS locked · ±${Math.round(accuracy)} m` : 'GPS locked',
      cls: 'text-emerald-300',
    },
    denied: { icon: X, spin: false, text: 'GPS unavailable', cls: 'text-rose-300' },
  }[gpsStatus];

  /* -------------------------------- sidebar -------------------------------- */
  const panel = (
    <>
      <Section icon={UserRound} title="My details" tint="cyan">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Mobile" value={profile?.phone || '—'} />
        <InfoRow label="Account" value="driver" />
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-slate-400">Trip</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              isLive
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400'
            }`}
          >
            {isLive && <PulseDot color="emerald" />}
            {isLive ? 'On air' : 'Offline'}
          </span>
        </div>
      </Section>

      {/* PlateManager brings its own card + heading, so it is not wrapped in a Section. */}
      <PlateManager
        plates={plates}
        activePlate={activePlate}
        onSelect={setActivePlate}
        onChange={setPlates}
        disabled={isLive}
      />

      <Section icon={Bus} title="Trip & GPS" tint="emerald">
        {!connected && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-200">
            Backend not connected — start the realtime server on port 4000 first.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Route
          </span>
          <span className="relative block">
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              disabled={isLive || routes.length === 0}
              className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 pr-8 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25 disabled:opacity-50"
            >
              {routes.length === 0 && <option value="">Loading routes…</option>}
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </span>
        </label>

        <button
          type="button"
          onClick={isLive ? endTrip : beginTrip}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold shadow-lg transition ${
            isLive
              ? 'bg-rose-500 text-white shadow-rose-500/25 hover:bg-rose-400'
              : 'bg-emerald-500 text-slate-950 shadow-emerald-500/25 hover:bg-emerald-400'
          }`}
        >
          {isLive ? (
            <>
              <Square size={14} /> End Trip
            </>
          ) : (
            <>
              <Play size={14} /> Start Trip · Share Live GPS
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleSim}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-semibold transition ${
            simEnabled
              ? 'border-violet-400/60 bg-violet-500/25 text-violet-200'
              : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-violet-400/40 hover:text-violet-200'
          }`}
        >
          <Satellite size={13} />
          {simEnabled ? 'Simulate GPS Movement · ON' : 'Simulate GPS Movement (Demo)'}
        </button>

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[10px] text-rose-200">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="space-y-1.5 rounded-xl border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
          <InfoRow label="Latitude" value={fmtCoord(telemetry.lat)} mono />
          <InfoRow label="Longitude" value={fmtCoord(telemetry.lng)} mono />
          <InfoRow label="Speed" value={`${telemetry.speed.toFixed(1)} km/h`} mono />
          <InfoRow
            label="Heading"
            value={`${Math.round(telemetry.heading)}° ${cardinal(telemetry.heading)}`}
            mono
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-2 text-center">
            <Send size={12} className="mx-auto mb-1 text-cyan-400" />
            <p className="font-mono text-xs font-bold">{sentCount}</p>
            <p className="text-[8px] uppercase tracking-wide text-slate-500">sent</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-2 text-center">
            <Timer size={12} className="mx-auto mb-1 text-cyan-400" />
            <p className="font-mono text-xs font-bold">{fmtDuration(elapsed)}</p>
            <p className="text-[8px] uppercase tracking-wide text-slate-500">trip</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-2 text-center">
            <gpsBadge.icon
              size={12}
              className={`mx-auto mb-1 ${gpsBadge.cls} ${gpsBadge.spin ? 'animate-spin' : ''}`}
            />
            <p className={`truncate text-[9px] font-bold ${gpsBadge.cls}`}>{gpsBadge.text}</p>
            <p className="text-[8px] uppercase tracking-wide text-slate-500">gps</p>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-500">
          Fixes broadcast every {TICK_MS / 1000} s via Socket.IO.
          {simEnabled ? ' Demo mode drives a virtual jeepney at ~22–35 km/h.' : ''}
        </p>
      </Section>

      <Section icon={Users} title="Passenger status" tint={full ? 'rose' : 'blue'}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAvailability(false)}
            aria-pressed={!full}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              !full
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users size={14} /> Still Vacant
          </button>
          <button
            type="button"
            onClick={() => setAvailability(true)}
            aria-pressed={full}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              full
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users size={14} /> Full
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-slate-400">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: full ? '#ef4444' : '#3b82f6' }}
          />
          {full
            ? 'Your jeepney shows red — commuters see "no more seats".'
            : 'Your jeepney shows blue — commuters know you can still pick them up.'}
        </p>
      </Section>
    </>
  );

  /* --------------------------------- stage --------------------------------- */
  return (
    <AppShell
      brand="Driver"
      panel={panel}
      open={drawerOpen}
      onCloseDrawer={onCloseDrawer}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <section className="absolute inset-0">
        <MapContainer
          center={ILOILO_CENTER}
          zoom={13}
          className="h-full w-full"
          zoomControl={false}
          ref={miniMapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {selectedRoute && (
            <Polyline
              positions={selectedRoute.stops.map((s) => [s.lat, s.lng])}
              color={selectedRoute.color}
              weight={3}
              opacity={0.45}
              dashArray={selectedRoute.loop ? '8 10' : undefined}
            />
          )}
          {telemetry.lat != null && selectedRoute && (
            <VehicleMarker
              vehicle={{
                vehicleId: metaRef.current?.vehicleId ?? (activePlate || 'YOU'),
                lat: telemetry.lat,
                lng: telemetry.lng,
                speed: telemetry.speed,
                heading: telemetry.heading,
                updatedAt: Date.now(),
                full,
              }}
              route={selectedRoute}
            />
          )}
        </MapContainer>

        {/* --------------- slim status bar (keeps the map visible) --------------- */}
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-[1000] flex flex-wrap items-center gap-2 lg:left-3 lg:top-3">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/90 px-3 shadow-xl backdrop-blur">
            <span
              className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
                isLive ? 'text-emerald-300' : 'text-slate-400'
              }`}
            >
              {isLive ? <PulseDot color="emerald" /> : <Satellite size={12} />}
              {isLive ? 'On air' : 'Offline'}
            </span>
            <span className="h-4 w-px bg-slate-700" />
            <span className="font-mono text-[11px] font-bold text-slate-100">
              {metaRef.current?.vehicleId ?? activePlate ?? 'no plate'}
            </span>
            {isLive && (
              <>
                <span className="h-4 w-px bg-slate-700" />
                <span className="font-mono text-[10px] text-slate-400">
                  {telemetry.speed.toFixed(0)} km/h · {sentCount} sent
                </span>
              </>
            )}
          </div>
        </div>

        {/* Follow-me toggle */}
        <div className="absolute right-2 top-2 z-[1000] lg:right-3 lg:top-3">
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur transition ${
              follow
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-600 bg-slate-900/80 text-slate-300'
            }`}
          >
            <Crosshair size={13} /> {follow ? 'Following' : 'Free pan'}
          </button>
        </div>

        {/* Placeholder before the first fix arrives */}
        {telemetry.lat == null && (
          <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/90 px-5 py-4 text-center shadow-xl backdrop-blur">
              <Satellite size={22} className="mx-auto mb-1.5 animate-pulse text-cyan-400" />
              <p className="text-sm font-semibold">Waiting for your first GPS fix…</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Start a trip (or the simulator) from the panel.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ------------- bottom-right corner: pokes + availability ------------- */}
      <div className="pointer-events-none fixed bottom-7 right-2 z-[1200] flex flex-col items-end gap-2.5 sm:right-4 lg:bottom-8 lg:right-5">
        <DriverPokes plate={activePlate} className="pointer-events-auto" />

        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-1.5 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => setAvailability(false)}
            aria-pressed={!full}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
              !full
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users size={14} /> Still Vacant
          </button>
          <button
            type="button"
            onClick={() => setAvailability(true)}
            aria-pressed={full}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
              full
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users size={14} /> Full
          </button>
        </div>

        <p className="pointer-events-none flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold text-slate-300 backdrop-blur">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: full ? '#ef4444' : '#3b82f6' }}
          />
          {full ? 'Full — commuters see red' : 'Still vacant — commuters see blue'}
          {isLive && <Check size={11} className="text-emerald-400" />}
        </p>
      </div>
    </AppShell>
  );
}
