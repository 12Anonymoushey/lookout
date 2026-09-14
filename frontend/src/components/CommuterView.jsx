import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import {
  Bookmark,
  Bus,
  Check,
  ChevronDown,
  Clock,
  Eye,
  Hand,
  Loader2,
  LocateFixed,
  MapPin,
  Radio,
  Route,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import AppShell, { InfoRow, Section } from './AppShell.jsx';
import PulseDot from './PulseDot.jsx';
import VehicleMarker from './VehicleMarker.jsx';
import { KebabMenu, SearchSortBar } from './KebabMenu.jsx';
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
const FRESH_WINDOW_MS = 90_000;
const POKE_RANGE_KM = 4;
const POKE_COOLDOWN_MS = 6_000;

const meIcon = L.divIcon({
  className: 'lo-me-wrapper',
  html: `<div class="lo-me"><span class="lo-me__halo"></span><span class="lo-me__dot"></span><span class="lo-me__label">You are here</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const pokeIcon = (sent) =>
  L.divIcon({
    className: 'lo-poke-wrapper',
    html: `<div class="lo-poke__bob"><span class="lo-poke ${sent ? 'lo-poke--sent' : ''}">${
      sent ? '✓ Poked!' : '👋 Poke'
    }</span></div>`,
    iconSize: [104, 34],
    iconAnchor: [52, 62],
  });

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
  const [, setTick] = useState(0);
  const [myLocation, setMyLocation] = useState(null);
  const [locState, setLocState] = useState('idle');
  const [pokes, setPokes] = useState({});
  const [toast, setToast] = useState('');
  const [savedTransports, setSavedTransports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_saved_transports') || '[]'); } catch { return []; }
  });
  const [recentRides, setRecentRides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_recent_rides') || '[]'); } catch { return []; }
  });
  const [savedSearch, setSavedSearch] = useState('');
  const [savedSort, setSavedSort] = useState({ field: 'plate', dir: 'asc' });
  const [recentSearch, setRecentSearch] = useState('');
  const [recentSort, setRecentSort] = useState({ field: 'plate', dir: 'asc' });
  const mapRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) { setLocState('unsupported'); return undefined; }
    setLocState('locating');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, at: pos.timestamp });
        setLocState('locked');
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);

  const visibleVehicles = useMemo(
    () => vehicles.filter((v) => Date.now() - (v.updatedAt ?? 0) < FRESH_WINDOW_MS && (routeFilter === 'all' || v.routeId === routeFilter)),
    [vehicles, routeFilter],
  );

  const focusRoute = routeFilter === 'all' ? null : routeById[routeFilter] ?? null;

  const approaching = useMemo(() => {
    if (!selectedStop) return [];
    return visibleVehicles
      .map((v) => ({ vehicle: v, km: haversineKm(selectedStop.lat, selectedStop.lng, v.lat, v.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8)
      .map(({ vehicle, km }) => ({ vehicle, km, etaMin: etaMinutes(km, vehicle.speed) }));
  }, [visibleVehicles, selectedStop]);

  const pokeAnchor = myLocation ?? (selectedStop ? { lat: selectedStop.lat, lng: selectedStop.lng } : null);

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
      } catch {
        setPokes((prev) => ({ ...prev, [vehicleId]: { state: 'idle', at: Date.now() } }));
        setToast('Could not send poke — check connection.');
      }
    },
    [myLocation, pokeStateOf, profile, selectedStop],
  );

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---- Saved transportations CRUD ---- */
  const addSavedTransport = (vehicle) => {
    const entry = {
      id: Date.now().toString(),
      plate: vehicle.vehicleId,
      route: routeById[vehicle.routeId]?.name || '—',
      lastSeen: new Date().toLocaleTimeString(),
    };
    const next = [...savedTransports, entry];
    setSavedTransports(next);
    localStorage.setItem('lo_saved_transports', JSON.stringify(next));
    setToast(`Saved ${vehicle.vehicleId}`);
  };
  const removeSavedTransport = (id) => {
    const next = savedTransports.filter((t) => t.id !== id);
    setSavedTransports(next);
    localStorage.setItem('lo_saved_transports', JSON.stringify(next));
    setToast('Removed from saved');
  };

  /* ---- Recent rides CRUD ---- */
  const addRecentRide = (vehicle) => {
    const entry = {
      id: Date.now().toString(),
      plate: vehicle.vehicleId,
      route: routeById[vehicle.routeId]?.name || '—',
      time: new Date().toLocaleTimeString(),
      status: statusMeta(vehicle).label,
    };
    const next = [entry, ...recentRides].slice(0, 50);
    setRecentRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
    setToast(`Ride with ${vehicle.vehicleId} confirmed`);
  };
  const removeRecentRide = (id) => {
    const next = recentRides.filter((r) => r.id !== id);
    setRecentRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
    setToast('Removed from recent');
  };

  /* ---- Stats ---- */
  const stats = useMemo(() => {
    if (recentRides.length === 0) return null;
    return {
      total: recentRides.length,
      routes: new Set(recentRides.map((r) => r.route)).size,
      vehicles: new Set(recentRides.map((r) => r.plate)).size,
    };
  }, [recentRides]);

  const filteredSaved = useMemo(() => {
    let list = savedTransports;
    if (savedSearch) {
      const q = savedSearch.toLowerCase();
      list = list.filter((t) => [t.plate, t.route].some((f) => String(f).toLowerCase().includes(q)));
    }
    list = [...list].sort((a, b) => {
      const va = a[savedSort.field] ?? '';
      const vb = b[savedSort.field] ?? '';
      return savedSort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [savedTransports, savedSearch, savedSort]);

  const filteredRecent = useMemo(() => {
    let list = recentRides;
    if (recentSearch) {
      const q = recentSearch.toLowerCase();
      list = list.filter((r) => [r.plate, r.route].some((f) => String(f).toLowerCase().includes(q)));
    }
    list = [...list].sort((a, b) => {
      const va = a[recentSort.field] ?? '';
      const vb = b[recentSort.field] ?? '';
      return recentSort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [recentRides, recentSearch, recentSort]);

  const handleFilterChange = (value) => { setRouteFilter(value); setSelectedStop(null); };

  const recenter = () => {
    if (myLocation) mapRef.current?.flyTo([myLocation.lat, myLocation.lng], 16, { duration: 0.8 });
    else mapRef.current?.flyTo(ILOILO_CENTER, 14, { duration: 0.8 });
  };

  const routePositions = focusRoute
    ? focusRoute.loop ? loopPositions(focusRoute.stops) : focusRoute.stops.map((s) => [s.lat, s.lng])
    : [];

  const locBadge = locState === 'locked'
    ? `±${Math.round(myLocation?.accuracy ?? 0)} m`
    : locState === 'locating' ? 'locating…' : locState === 'denied' ? 'location off' : 'unavailable';

  /* -------------------------------- sidebar -------------------------------- */
  const panel = (
    <>
      {/* Tab 1: My Details */}
      <Section icon={UserRound} title="My Details" tint="pink">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Mobile" value={profile?.phone || '—'} />
        <InfoRow label="Account" value={role ?? 'commuter'} />
        <InfoRow label="Pokes sent" value={pokesSent} />
      </Section>

      {/* Tab 2: Saved Transportations */}
      <Section icon={Bookmark} title="Saved Transportations" tint="sky">
        <SearchSortBar
          search={savedSearch}
          onSearchChange={setSavedSearch}
          sortField={savedSort.field}
          sortDir={savedSort.dir}
          onSortToggle={(field, dir) => setSavedSort({ field, dir })}
          fields={['plate', 'route', 'lastSeen']}
          placeholder="Search plates…"
        />
        {filteredSaved.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-[#8a7098]">
            {savedTransports.length === 0 ? 'No saved transports yet.' : 'No matches.'}
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {filteredSaved.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430]/50 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-[#e0d4ec]">{t.plate}</p>
                  <p className="text-[10px] text-[#8a7098]">{t.route} · {t.lastSeen}</p>
                </div>
                <KebabMenu items={[
                  { icon: Bus, label: 'View on map', onClick: () => {} },
                  { icon: Trash2, label: 'Remove', danger: true, onClick: () => removeSavedTransport(t.id) },
                ]} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tab 3: Recent Rides */}
      <Section icon={Clock} title="Recent Rides" tint="cyan" defaultOpen={false}>
        <SearchSortBar
          search={recentSearch}
          onSearchChange={setRecentSearch}
          sortField={recentSort.field}
          sortDir={recentSort.dir}
          onSortToggle={(field, dir) => setRecentSort({ field, dir })}
          fields={['plate', 'route', 'time']}
          placeholder="Search recent…"
        />
        {filteredRecent.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-[#8a7098]">
            {recentRides.length === 0 ? 'No rides yet.' : 'No matches.'}
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {filteredRecent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430]/50 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-[#e0d4ec]">{r.plate}</p>
                  <p className="text-[10px] text-[#8a7098]">{r.route} · {r.time}</p>
                </div>
                <KebabMenu items={[
                  { icon: Eye, label: 'Details', onClick: () => {} },
                  { icon: Trash2, label: 'Remove', danger: true, onClick: () => removeRecentRide(r.id) },
                ]} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tab 4: Stats */}
      <Section icon={Star} title="Stats" tint="yellow" defaultOpen={false}>
        {stats ? (
          <div className="space-y-1.5">
            <InfoRow label="Total rides" value={stats.total} />
            <InfoRow label="Routes used" value={stats.routes} />
            <InfoRow label="Unique vehicles" value={stats.vehicles} />
          </div>
        ) : (
          <p className="py-2 text-center text-[11px] text-[#8a7098]">Ride a jeepney to see stats here.</p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-[#8a7098]">
          Stats update as you ride. Tap a jeepney and confirm to start tracking.
        </p>
      </Section>

      <Section icon={Route} title="Live Fleet" tint="pink" defaultOpen={false}>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8a7098]">Filter by route</span>
          <span className="relative block">
            <select
              value={routeFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 pr-8 text-xs text-[#f0e6f6] focus:border-[var(--lo-pink)] focus:outline-none focus:ring-2 focus:ring-[#FF69B4]/25"
            >
              <option value="all">All routes</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>{route.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8a7098]" />
          </span>
        </label>
        <InfoRow label="Live vehicles" value={visibleVehicles.length} />
        <InfoRow label="My point" value={locBadge} />
        <button
          type="button"
          onClick={recenter}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430]/50 px-3 py-2 text-[11px] font-bold text-[#e0d4ec] transition hover:border-[var(--lo-pink)] hover:text-[var(--lo-pink)]"
        >
          <LocateFixed size={12} /> {myLocation ? 'Center on my point' : 'Recenter'}
        </button>
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
        <MapContainer center={ILOILO_CENTER} zoom={14} className="h-full w-full" zoomControl={false} ref={mapRef}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {focusRoute && (
            <>
              <Polyline positions={routePositions} color={focusRoute.color} weight={4} opacity={0.7} dashArray={focusRoute.loop ? '8 10' : undefined} />
              {focusRoute.stops.map((stop) => (
                <CircleMarker
                  key={stop.id}
                  center={[stop.lat, stop.lng]}
                  radius={7}
                  pathOptions={{ color: '#0e0a18', weight: 2, fillColor: focusRoute.color, fillOpacity: 1 }}
                  eventHandlers={{ click: () => setSelectedStop(stop) }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>{stop.name}</Tooltip>
                </CircleMarker>
              ))}
            </>
          )}
          {myLocation && (
            <>
              {myLocation.accuracy > 0 && myLocation.accuracy < 500 && (
                <Circle center={[myLocation.lat, myLocation.lng]} radius={myLocation.accuracy} pathOptions={{ color: '#FF69B4', weight: 1, fillColor: '#FF69B4', fillOpacity: 0.08 }} />
              )}
              <Marker position={[myLocation.lat, myLocation.lng]} icon={meIcon} zIndexOffset={400} />
            </>
          )}
          {visibleVehicles.map((vehicle) => (
            <VehicleMarker key={vehicle.vehicleId} vehicle={vehicle} route={routeById[vehicle.routeId] ?? null} onPoke={handlePoke} pokeState={pokeStateOf(vehicle.vehicleId)} />
          ))}
          {pokeTarget && (
            <Marker
              position={[pokeTarget.lat, pokeTarget.lng]}
              icon={pokeIcon(pokeStateOf(pokeTarget.vehicleId) !== 'idle')}
              zIndexOffset={900}
              eventHandlers={{ click: () => handlePoke(pokeTarget) }}
            />
          )}
        </MapContainer>

        {/* Slim live bar */}
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-[1000] flex flex-wrap items-center gap-2 lg:left-3 lg:top-3">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-[var(--lo-card-border)] bg-[var(--lo-panel)]/90 pl-3 pr-1.5 shadow-xl backdrop-blur">
            <span className="flex shrink-0 items-center gap-1.5">
              <PulseDot color="pink" />
              <span className="text-[11px] font-bold text-[var(--lo-pink)]">{visibleVehicles.length} live</span>
            </span>
            <span className="h-4 w-px shrink-0 bg-[var(--lo-card-border)]" />
            <label className="relative flex min-w-0 flex-1 items-center lg:w-52 lg:flex-none">
              <select
                value={routeFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
                aria-label="Filter by route"
                className="w-full appearance-none truncate rounded-full bg-transparent py-1 pl-1 pr-5 text-[11px] font-semibold text-[#e0d4ec] focus:outline-none"
              >
                <option value="all">All routes</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>{route.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-1 text-[#8a7098]" />
            </label>
            <button
              type="button"
              onClick={recenter}
              aria-label="Center on my point"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lo-card)] text-[#d8c8e8] transition hover:text-[var(--lo-pink)]"
            >
              {myLocation ? <LocateFixed size={13} /> : <MapPin size={13} />}
            </button>
          </div>
        </div>

        {/* Approaching vehicles panel */}
        {selectedStop && (
          <div className="absolute bottom-4 left-2 right-2 z-[1000] rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-panel)]/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:right-4 sm:w-96">
            <div className="mb-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <MapPin size={14} style={{ color: focusRoute?.color ?? '#FF69B4' }} />
                  {selectedStop.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[#8a7098]">{focusRoute?.name}</p>
              </div>
              <button type="button" onClick={() => setSelectedStop(null)} className="rounded-lg p-1 text-[#8a7098] transition hover:bg-[#3a2a50] hover:text-[#d8c8e8]">
                <X size={15} />
              </button>
            </div>
            {approaching.length === 0 ? (
              <p className="py-3 text-center text-xs text-[#8a7098]">No live vehicles on this route.</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {approaching.map(({ vehicle, km, etaMin }) => {
                  const meta = statusMeta(vehicle);
                  const state = pokeStateOf(vehicle.vehicleId);
                  return (
                    <li key={vehicle.vehicleId} className="rounded-xl border border-[var(--lo-card-border)] bg-[var(--lo-card)]/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#e0d4ec]">{vehicle.vehicleId}</p>
                          <p className="font-mono text-[11px] text-[#8a7098]">{(Number(vehicle.speed) || 0).toFixed(0)} km/h · {formatKm(km)} away</p>
                        </div>
                        <span className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold" style={{ background: 'var(--lo-cyan)', color: '#0e0a18' }}>
                          {formatEta(etaMin)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: meta.soft, color: meta.color }}>
                          {meta.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => addRecentRide(vehicle)}
                            className="rounded-lg bg-[var(--lo-pink)]/20 px-2 py-1 text-[10px] font-bold text-[var(--lo-pink)] transition hover:bg-[var(--lo-pink)]/30"
                          >
                            Ride
                          </button>
                          <button
                            type="button"
                            onClick={() => addSavedTransport(vehicle)}
                            className="rounded-lg bg-[var(--lo-sky)]/20 px-2 py-1 text-[10px] font-bold text-[var(--lo-sky)] transition hover:bg-[var(--lo-sky)]/30"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePoke(vehicle)}
                            disabled={state !== 'idle'}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                              state === 'sent' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[var(--lo-pink)] text-white hover:bg-[#ff80c0]'
                            } disabled:cursor-default`}
                          >
                            {state === 'sending' ? <Loader2 size={11} className="animate-spin" /> : state === 'sent' ? <Check size={11} /> : <Hand size={11} />}
                            {state === 'sent' ? 'Poked' : 'Poke'}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-14 z-[1100] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--lo-pink)]/50 bg-[var(--lo-panel)]/95 px-4 py-2 text-xs font-bold text-[var(--lo-pink-soft)] shadow-xl backdrop-blur">
            {toast}
          </div>
        )}

        {vehicles.length === 0 && !hasFetchError && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] w-[min(90vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-panel)]/90 p-5 text-center shadow-xl backdrop-blur">
            <Radio size={24} className="mx-auto mb-2 animate-pulse text-[var(--lo-pink)]" />
            <p className="text-sm font-semibold">No live vehicles yet</p>
            <p className="mt-1 text-xs leading-relaxed text-[#8a7098]">
              Open the Driver view in another window and start a trip.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
