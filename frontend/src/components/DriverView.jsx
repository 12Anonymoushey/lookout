import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, TileLayer } from 'react-leaflet';
import {
  AlertTriangle,
  Bus,
  ChevronDown,
  Compass,
  Crosshair,
  Gauge,
  Loader2,
  MapPin,
  Play,
  Satellite,
  Send,
  Square,
  Timer,
  X,
} from 'lucide-react';
import { socket } from '../services/socket.js';
import { bearingDeg, cardinal, haversineKm, pathLengthKm, pointAtDistance } from '../utils/geo.js';
import PulseDot from './PulseDot.jsx';
import StatCard from './StatCard.jsx';
import VehicleMarker from './VehicleMarker.jsx';

const ILOILO_CENTER = [10.7202, 122.5621];
const TICK_MS = 3000; // broadcast cadence required by the spec

const fmtCoord = (n) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toFixed(6));
const fmtDuration = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * DRIVER VIEW
 * Mobile-friendly console broadcasting real GPS fixes every 3 s via
 * navigator.geolocation.watchPosition, plus a classroom-friendly
 * "Simulate GPS Movement" mode that drives a virtual jeepney along the
 * selected LPTRP route polyline.
 */
export default function DriverView({ routes, connected }) {
  const [vehicleId, setVehicleId] = useState('');
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

  // Refs hold values needed inside interval/watch callbacks without stale closures.
  const watchIdRef = useRef(null);
  const tickRef = useRef(null);
  const latestFixRef = useRef(null);
  const simRef = useRef({ travelledKm: 0 });
  const metaRef = useRef(null); // { vehicleId, routeId }
  const simFlagRef = useRef(false);
  const isLiveRef = useRef(false);
  const routesRef = useRef(routes);
  const routeIdRef = useRef(routeId);
  const miniMapRef = useRef(null);

  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    routeIdRef.current = routeId;
  }, [routeId]);

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
            speedKmh =
              (haversineKm(prev.lat, prev.lng, c.latitude, c.longitude) / dtSec) * 3600;
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
    const vid = vehicleId.trim().toUpperCase();
    if (!vid) {
      setError('Enter your Vehicle Body Number first (e.g. JEEP-102).');
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

  return (
    <div className="grid h-full grid-cols-1 overflow-y-auto lg:grid-cols-[420px_minmax(0,1fr)] lg:overflow-hidden">
      {/* ------------------------- control column ------------------------- */}
      <aside className="flex flex-col gap-4 border-slate-800 p-4 lg:overflow-y-auto lg:border-r">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-2.5 shadow-lg shadow-cyan-500/20">
              <Bus size={22} />
            </div>
            <div className="leading-tight">
              <h2 className="text-lg font-bold">Driver Console</h2>
              <p className="text-xs text-slate-400">Broadcast your PUV&rsquo;s live GPS</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
              isLive
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400'
            }`}
          >
            {isLive && <PulseDot color="emerald" />}
            {isLive ? 'On Air' : 'Offline'}
          </span>
        </div>

        {!connected && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            Backend not connected — start the realtime server on port 4000 first.
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Vehicle Body No.
          </span>
          <input
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={isLive}
            placeholder="JEEP-102"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3.5 py-2.5 font-mono text-sm uppercase tracking-widest text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Route
          </span>
          <span className="relative block">
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              disabled={isLive || routes.length === 0}
              className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800/70 px-3.5 py-2.5 pr-9 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-50"
            >
              {routes.length === 0 && <option value="">Loading routes…</option>}
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </span>
        </label>

        <button
          type="button"
          onClick={isLive ? endTrip : beginTrip}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-lg transition ${
            isLive
              ? 'bg-rose-500 text-white shadow-rose-500/25 hover:bg-rose-400'
              : 'bg-emerald-500 text-slate-950 shadow-emerald-500/25 hover:bg-emerald-400'
          }`}
        >
          {isLive ? (
            <>
              <Square size={16} /> End Trip
            </>
          ) : (
            <>
              <Play size={16} /> Start Trip · Share Live GPS
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleSim}
          className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${
            simEnabled
              ? 'border-violet-400/60 bg-violet-500/25 text-violet-200'
              : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-violet-400/40 hover:text-violet-200'
          }`}
        >
          <Satellite size={15} />
          {simEnabled ? 'Simulate GPS Movement · ON' : 'Simulate GPS Movement (Demo Mode)'}
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {simEnabled && (
          <p className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-violet-200">
            <span className="font-bold">Demo mode:</span> a virtual jeepney cruises the selected
            route at ~22–35 km/h — perfect for classroom defense without moving an inch.
          </p>
        )}

        {/* Live telemetry */}
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard icon={MapPin} label="Latitude" value={fmtCoord(telemetry.lat)} />
          <StatCard icon={MapPin} label="Longitude" value={fmtCoord(telemetry.lng)} />
          <StatCard icon={Gauge} label="Speed" value={`${telemetry.speed.toFixed(1)} km/h`} />
          <StatCard
            icon={Compass}
            label="Heading"
            value={`${Math.round(telemetry.heading)}° ${cardinal(telemetry.heading)}`}
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-2.5 text-center">
            <Send size={13} className="mx-auto mb-1 text-cyan-400" />
            <p className="font-mono text-sm font-bold">{sentCount}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-500">Updates sent</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-2.5 text-center">
            <Timer size={13} className="mx-auto mb-1 text-cyan-400" />
            <p className="font-mono text-sm font-bold">{fmtDuration(elapsed)}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-500">Trip time</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-2.5 text-center">
            <gpsBadge.icon
              size={13}
              className={`mx-auto mb-1 ${gpsBadge.cls} ${gpsBadge.spin ? 'animate-spin' : ''}`}
            />
            <p className={`truncate text-[10px] font-semibold ${gpsBadge.cls}`}>{gpsBadge.text}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-500">Receiver</p>
          </div>
        </div>

        <p className="mt-auto pt-2 text-center text-[10px] leading-relaxed text-slate-500">
          Fixes broadcast every {TICK_MS / 1000} s via Socket.IO · Look Out! Capstone
        </p>

      </aside>

      {/* ------------------------ live preview map ------------------------ */}
      <section className="relative h-80 lg:h-auto">
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
                vehicleId: metaRef.current?.vehicleId ?? (vehicleId || 'YOU'),
                lat: telemetry.lat,
                lng: telemetry.lng,
                speed: telemetry.speed,
                heading: telemetry.heading,
                updatedAt: Date.now(),
              }}
              route={selectedRoute}
            />
          )}
        </MapContainer>

        {/* Follow-me toggle */}
        <div className="absolute right-3 top-3 z-[1000]">
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
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
              <p className="mt-0.5 text-xs text-slate-400">Start a trip or enable the simulator.</p>
            </div>
          </div>
        )}
      </section>
    </div>

  );
}
