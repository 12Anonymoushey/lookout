import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import {
  Bookmark,
  Bus,
  Check,
  Clock,
  Eye,
  Hand,
  Loader2,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Radio,
  Route,
  Search,
  Megaphone,
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
import { getAllAnnouncements } from '../services/announcementService.js';
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
  html: `<div class="lo-me"><span class="lo-me__dot"></span><span class="lo-me__label">You are here</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const pokeIcon = (sent) =>
  L.divIcon({
    className: 'lo-poke-wrapper',
    html: `<div class="lo-poke__bob"><span class="lo-poke ${sent ? 'lo-poke--sent' : ''}">${sent ? '✓ Poked!' : '👋 Poke'}</span></div>`,
    iconSize: [104, 34],
    iconAnchor: [52, 62],
  });

/** Build a row object from a live vehicle for both Saved and Recent lists. */
function vehicleToRow(vehicle, routeById, when) {
  const route = routeById[vehicle.routeId];
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    plate: vehicle.vehicleId,
    operatorName: route?.name || '—',
    driverName: '—',
    firstTrip: when,
    lastTrip: when,
  };
}

export default function CommuterView({
  routes,
  vehicles,
  hasFetchError = false,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  collapsed,
  onToggleCollapse,
}) {
  const { profile, role, updateDetails } = useAuth();

  // Edit My Details
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailDraft, setDetailDraft] = useState({ fullName: '', phone: '' });
  const [routeFilter, setRouteFilter] = useState('all');
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [, setTick] = useState(0);
  const [myLocation, setMyLocation] = useState(null);
  const [locState, setLocState] = useState('idle');
  const [pokes, setPokes] = useState({});
  const [toast, setToast] = useState('');

  // Saved PUVs
  const [savedTransports, setSavedTransports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_saved_transports') || '[]'); } catch { return []; }
  });
  const [savedSearch, setSavedSearch] = useState('');
  const [savedSort, setSavedSort] = useState({ field: 'plate', dir: 'asc' });
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [savedModalQuery, setSavedModalQuery] = useState('');

  // Recent Rides
  const [recentRides, setRecentRides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_recent_rides') || '[]'); } catch { return []; }
  });
  const [recentSearch, setRecentSearch] = useState('');
  const [recentSort, setRecentSort] = useState({ field: 'plate', dir: 'asc' });

  // Announcements
  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => { setAnnouncements(getAllAnnouncements()); }, []);

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

  const pokeStateOf = useCallback((vehicleId) => {
    const entry = pokes[vehicleId];
    if (!entry) return 'idle';
    if (entry.state === 'sent' && Date.now() - entry.at > POKE_COOLDOWN_MS) return 'idle';
    return entry.state;
  }, [pokes]);

  const pokesSent = useMemo(() => Object.values(pokes).filter((e) => e.state === 'sent').length, [pokes]);

  const handlePoke = useCallback(async (vehicle) => {
    const vid = vehicle?.vehicleId;
    if (!vid || pokeStateOf(vid) !== 'idle') return;
    setPokes((p) => ({ ...p, [vid]: { state: 'sending', at: Date.now() } }));
    try {
      await sendPoke({ toPlate: vid, fromName: profile?.fullName || 'A commuter', message: 'Poke! 👋', lat: myLocation?.lat ?? selectedStop?.lat ?? null, lng: myLocation?.lng ?? selectedStop?.lng ?? null, routeId: vehicle.routeId ?? null });
      setPokes((p) => ({ ...p, [vid]: { state: 'sent', at: Date.now() } }));
      setToast(`Poke sent to ${vid}! 👋`);
    } catch {
      setPokes((p) => ({ ...p, [vid]: { state: 'idle', at: Date.now() } }));
      setToast('Could not send poke.');
    }
  }, [myLocation, pokeStateOf, profile, selectedStop]);

  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 3200); return () => clearTimeout(id); }, [toast]);

  /* ---- Edit My Details ---- */
  const openDetailEditor = () => { setDetailDraft({ fullName: profile?.fullName || '', phone: profile?.phone || '' }); setEditingDetails(true); };
  const saveDetails = async () => {
    try {
      await updateDetails({ fullName: detailDraft.fullName.trim(), phone: detailDraft.phone.trim() });
      setToast('Details updated');
      setEditingDetails(false);
    } catch { setToast('Could not update details'); }
  };

  /* ---- Saved PUV: add from search modal ---- */
  const now = () => new Date().toLocaleString();
  const addSavedFromSearch = (vehicle) => {
    const row = vehicleToRow(vehicle, routeById, now());
    const next = [...savedTransports, row];
    setSavedTransports(next);
    localStorage.setItem('lo_saved_transports', JSON.stringify(next));
    setToast(`Saved ${vehicle.vehicleId}`);
  };
  const removeSaved = (id) => {
    const next = savedTransports.filter((t) => t.id !== id);
    setSavedTransports(next);
    localStorage.setItem('lo_saved_transports', JSON.stringify(next));
    setToast('Removed from saved');
  };

  /* ---- Recent Rides: add via Ride button ---- */
  const addRecentRide = (vehicle) => {
    const row = { ...vehicleToRow(vehicle, routeById, now()), time: now() };
    const next = [row, ...recentRides].slice(0, 50);
    setRecentRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
    setToast(`Ride with ${vehicle.vehicleId} added`);
  };
  const removeRecent = (id) => {
    const next = recentRides.filter((r) => r.id !== id);
    setRecentRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
    setToast('Removed from recent');
  };

  /* ---- Stats ---- */
  const stats = useMemo(() => {
    if (recentRides.length === 0) return null;
    return { total: recentRides.length, routes: new Set(recentRides.map((r) => r.operatorName)).size, vehicles: new Set(recentRides.map((r) => r.plate)).size };
  }, [recentRides]);

  /* ---- Filtered lists ---- */
  const filteredSaved = useMemo(() => {
    let list = savedTransports;
    if (savedSearch) { const q = savedSearch.toLowerCase(); list = list.filter((t) => [t.plate, t.operatorName, t.driverName].some((f) => String(f).toLowerCase().includes(q))); }
    list = [...list].sort((a, b) => { const va = a[savedSort.field] ?? ''; const vb = b[savedSort.field] ?? ''; return savedSort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va)); });
    return list;
  }, [savedTransports, savedSearch, savedSort]);

  const filteredRecent = useMemo(() => {
    let list = recentRides;
    if (recentSearch) { const q = recentSearch.toLowerCase(); list = list.filter((r) => [r.plate, r.operatorName, r.driverName].some((f) => String(f).toLowerCase().includes(q))); }
    list = [...list].sort((a, b) => { const va = a[recentSort.field] ?? ''; const vb = b[recentSort.field] ?? ''; return recentSort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va)); });
    return list;
  }, [recentRides, recentSearch, recentSort]);

  /* ---- Saved PUV search modal: filter live vehicles by query ---- */
  const savedModalResults = useMemo(() => {
    if (!savedModalQuery.trim()) return visibleVehicles;
    const q = savedModalQuery.toLowerCase();
    return visibleVehicles.filter((v) => {
      const route = routeById[v.routeId];
      return [v.vehicleId, route?.name ?? ''].some((f) => String(f).toLowerCase().includes(q));
    });
  }, [visibleVehicles, savedModalQuery, routeById]);

  const handleFilterChange = (v) => { setRouteFilter(v); setSelectedStop(null); setRoutePickerOpen(false); };
  const recenter = () => { mapRef.current?.flyTo(myLocation ? [myLocation.lat, myLocation.lng] : ILOILO_CENTER, myLocation ? 16 : 14, { duration: 0.8 }); };
  const routePositions = focusRoute ? (focusRoute.loop ? loopPositions(focusRoute.stops) : focusRoute.stops.map((s) => [s.lat, s.lng])) : [];
  const locBadge = locState === 'locked' ? `±${Math.round(myLocation?.accuracy ?? 0)} m` : locState === 'locating' ? 'locating…' : locState === 'denied' ? 'location off' : 'unavailable';

  /* ======================== SIDEBAR PANEL ======================== */
  const panel = (
    <>
      <Section icon={UserRound} title="My Details" tint="primary">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Mobile" value={profile?.phone || '—'} />
        <InfoRow label="Account" value={role ?? 'commuter'} />
        <InfoRow label="Pokes sent" value={pokesSent} />
        <button type="button" onClick={openDetailEditor}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-bold transition hover:opacity-80"
          style={{ borderColor: 'var(--lo-primary)', color: 'var(--lo-primary)' }}>
          <Pencil size={12} /> Edit Details
        </button>
      </Section>

      {/* ---- Saved Transportations ---- */}
      <Section id="commuter-saved" icon={Bookmark} title="Saved Transportations" tint="success">
        {/* + button to open search modal */}
        <button type="button" onClick={() => { setSavedModalOpen(true); setSavedModalQuery(''); }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-2.5 text-xs font-bold transition hover:opacity-80"
          style={{ borderColor: 'var(--lo-primary)', color: 'var(--lo-primary)' }}>
          <Plus size={14} /> Add Saved PUV
        </button>

        <SearchSortBar search={savedSearch} onSearchChange={setSavedSearch} sortField={savedSort.field} sortDir={savedSort.dir}
          onSortToggle={(field, dir) => setSavedSort({ field, dir })} fields={['plate', 'operatorName', 'driverName']} placeholder="Search saved…" />

        {filteredSaved.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>
            {savedTransports.length === 0 ? 'No saved PUVs yet.' : 'No matches.'}
          </p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1 px-2 text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>
              <span>Plate</span><span>Operator</span><span></span>
            </div>
            {filteredSaved.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1 rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{t.plate}</p>
                  <p className="text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>Driver: {t.driverName}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[10px]" style={{ color: 'var(--lo-text-secondary)' }}>{t.operatorName}</p>
                  <p className="text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>1st: {t.firstTrip}</p>
                </div>
                <KebabMenu items={[
                  { icon: Eye, label: 'Details', onClick: () => {} },
                  { icon: Trash2, label: 'Remove', danger: true, onClick: () => removeSaved(t.id) },
                ]} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---- Recent Rides ---- */}
      <Section id="commuter-rides" icon={Clock} title="Recent Rides" tint="primary" defaultOpen={false}>
        <SearchSortBar search={recentSearch} onSearchChange={setRecentSearch} sortField={recentSort.field} sortDir={recentSort.dir}
          onSortToggle={(field, dir) => setRecentSort({ field, dir })} fields={['plate', 'operatorName', 'driverName']} placeholder="Search rides…" />

        {filteredRecent.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>
            {recentRides.length === 0 ? 'No rides yet. Tap a PUV and press Ride.' : 'No matches.'}
          </p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1 px-2 text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>
              <span>Plate</span><span>Operator</span><span></span>
            </div>
            {filteredRecent.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1 rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{r.plate}</p>
                  <p className="text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>Driver: {r.driverName}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[10px]" style={{ color: 'var(--lo-text-secondary)' }}>{r.operatorName}</p>
                  <p className="text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>Last: {r.lastTrip}</p>
                </div>
                <KebabMenu items={[
                  { icon: Eye, label: 'Details', onClick: () => {} },
                  { icon: Trash2, label: 'Remove', danger: true, onClick: () => removeRecent(r.id) },
                ]} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Star} title="Stats" tint="primary" defaultOpen={false}>
        {stats ? (
          <div className="space-y-1.5">
            <InfoRow label="Total rides" value={stats.total} />
            <InfoRow label="Operators" value={stats.routes} />
            <InfoRow label="Unique plates" value={stats.vehicles} />
          </div>
        ) : (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>Ride a PUV to see stats.</p>
        )}
      </Section>

      {/* ---- Announcements ---- */}
      <Section icon={Megaphone} title="Announcements" tint="success" defaultOpen={false}>
        {announcements.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>No announcements yet.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                <p className="truncate text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{a.title}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>{a.message}</p>
                <p className="mt-1 text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>{a.driverName} · {a.plate} · {a.createdAt}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Route} title="Live Fleet" tint="primary" defaultOpen={false}>
        <InfoRow label="Live vehicles" value={visibleVehicles.length} />
        <InfoRow label="My point" value={locBadge} />
      </Section>
    </>
  );

  const dockItems = [
    { id: 'map', label: 'Live map', icon: MapPin, returnToMap: true, onSelect: () => setRoutePickerOpen(false) },
    { id: 'routes', label: 'Select route', icon: Route, returnToMap: true, onSelect: () => setRoutePickerOpen((open) => !open) },
    { id: 'center', label: 'Center map', icon: LocateFixed, returnToMap: true, onSelect: () => { setRoutePickerOpen(false); recenter(); } },
    { id: 'saved', label: 'Saved PUVs', icon: Bookmark, target: 'commuter-saved' },
    { id: 'rides', label: 'Recent rides', icon: Clock, target: 'commuter-rides' },
  ];

  /* ======================== MAP STAGE ======================== */
  return (
    <AppShell brand="Commuter" panel={panel} dockItems={dockItems} open={drawerOpen} onOpenDrawer={onOpenDrawer} onCloseDrawer={onCloseDrawer} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div id="commuter-map" className="absolute inset-0 scroll-m-6">
        <MapContainer center={ILOILO_CENTER} zoom={14} className="h-full w-full" zoomControl={false} ref={mapRef}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {focusRoute && (
            <>
              <Polyline positions={routePositions} color={focusRoute.color} weight={4} opacity={0.7} dashArray={focusRoute.loop ? '8 10' : undefined} />
              {focusRoute.stops.map((stop) => (
                <CircleMarker key={stop.id} center={[stop.lat, stop.lng]} radius={7}
                  pathOptions={{ color: 'var(--lo-text)', weight: 2, fillColor: focusRoute.color, fillOpacity: 1 }}
                  eventHandlers={{ click: () => setSelectedStop(stop) }}>
                  <Tooltip direction="top" offset={[0, -6]}>{stop.name}</Tooltip>
                </CircleMarker>
              ))}
            </>
          )}
          {myLocation && (
            <>
              {myLocation.accuracy > 0 && myLocation.accuracy < 500 && (
                <Circle center={[myLocation.lat, myLocation.lng]} radius={myLocation.accuracy} pathOptions={{ color: '#10B981', weight: 1, fillColor: '#10B981', fillOpacity: 0.08 }} />
              )}
              <Marker position={[myLocation.lat, myLocation.lng]} icon={meIcon} zIndexOffset={400} />
            </>
          )}
          {visibleVehicles.map((v) => (
            <VehicleMarker key={v.vehicleId} vehicle={v} route={routeById[v.routeId] ?? null} onPoke={handlePoke} pokeState={pokeStateOf(v.vehicleId)} />
          ))}
          {pokeTarget && (
            <Marker position={[pokeTarget.lat, pokeTarget.lng]} icon={pokeIcon(pokeStateOf(pokeTarget.vehicleId) !== 'idle')} zIndexOffset={900}
              eventHandlers={{ click: () => handlePoke(pokeTarget) }} />
          )}
        </MapContainer>

        <div className="pointer-events-none absolute left-2 top-2 z-[1000] lg:left-3 lg:top-3">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border px-3 shadow-xl backdrop-blur" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
            <span className="flex items-center gap-1.5">
              <PulseDot color="emerald" />
              <span className="text-[11px] font-bold" style={{ color: 'var(--lo-primary)' }}>{visibleVehicles.length} live</span>
            </span>
          </div>
        </div>

        {routePickerOpen && (
          <section aria-label="Select route" className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-[1100] max-h-[min(60vh,24rem)] w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <h2 className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Select route</h2>
            <div role="listbox" aria-label="Available routes" className="space-y-1">
              {[{ id: 'all', name: 'All routes' }, ...routes.map((route) => ({ id: route.id, name: route.name }))].map((route) => (
                <button key={route.id} type="button" role="option" aria-selected={routeFilter === route.id} onClick={() => handleFilterChange(route.id)}
                  className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold transition ${routeFilter === route.id ? 'bg-blue-600 text-white' : 'text-slate-900 hover:bg-slate-50'}`}>
                  {route.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Approaching vehicles panel */}
        {selectedStop && (
          <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-2 right-2 z-[1000] rounded-2xl border p-4 shadow-xl backdrop-blur sm:bottom-4 sm:left-auto sm:right-4 sm:w-96" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
            <div className="mb-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--lo-text)' }}>
                  <MapPin size={14} style={{ color: focusRoute?.color ?? '#2563EB' }} />{selectedStop.name}
                </p>
                <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>{focusRoute?.name}</p>
              </div>
              <button type="button" onClick={() => setSelectedStop(null)} className="rounded-lg p-1 transition hover:opacity-70" style={{ color: 'var(--lo-text-secondary)' }}>
                <X size={15} />
              </button>
            </div>
            {approaching.length === 0 ? (
              <p className="py-3 text-center text-xs" style={{ color: 'var(--lo-text-secondary)' }}>No live vehicles on this route.</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {approaching.map(({ vehicle, km, etaMin }) => {
                  const meta = statusMeta(vehicle);
                  const state = pokeStateOf(vehicle.vehicleId);
                  return (
                    <li key={vehicle.vehicleId} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold" style={{ color: 'var(--lo-text)' }}>{vehicle.vehicleId}</p>
                          <p className="font-mono text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>{(Number(vehicle.speed) || 0).toFixed(0)} km/h · {formatKm(km)} away</p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">{formatEta(etaMin)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: meta.soft, color: 'var(--lo-text)' }}>{meta.label}</span>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => addRecentRide(vehicle)}
                            className="min-h-11 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700">Ride</button>
                          <button type="button" onClick={() => handlePoke(vehicle)} disabled={state !== 'idle'}
                            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-900 transition hover:brightness-95">
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
          <div className="lo-toast pointer-events-none absolute left-1/2 top-14 z-[1100] -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-bold shadow-xl backdrop-blur"
            style={{ borderColor: 'var(--lo-primary)', background: 'var(--lo-panel)', color: 'var(--lo-primary)' }}>
            {toast}
          </div>
        )}

        {vehicles.length === 0 && !hasFetchError && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] w-[min(90vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 text-center shadow-xl backdrop-blur"
            style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
            <Radio size={24} className="mx-auto mb-2 animate-pulse" style={{ color: 'var(--lo-primary)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--lo-text)' }}>No live vehicles yet</p>
          </div>
        )}
      </div>

      {/* ==================== SAVED PUV SEARCH MODAL ==================== */}
      {savedModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/35 backdrop-blur-sm sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Add saved PUV" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:mx-4 sm:max-w-md sm:rounded-2xl sm:pb-0">
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Add Saved PUV</h3>
              <button type="button" onClick={() => setSavedModalOpen(false)} aria-label="Close saved PUV dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-50 hover:opacity-70">
                <X size={20} />
              </button>
            </header>
            <div className="p-4">
              <div className="relative mb-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lo-text-secondary)' }} />
                <input value={savedModalQuery} onChange={(e) => setSavedModalQuery(e.target.value)} placeholder="Search by plate number or operator…"
                  className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} autoFocus />
              </div>
              {savedModalResults.length === 0 ? (
                <p className="py-6 text-center text-xs" style={{ color: 'var(--lo-text-secondary)' }}>No live vehicles found.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {savedModalResults.map((v) => {
                    const route = routeById[v.routeId];
                    const alreadySaved = savedTransports.some((s) => s.plate === v.vehicleId);
                    return (
                      <li key={v.vehicleId} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition hover:opacity-80"
                        style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold" style={{ color: 'var(--lo-text)' }}>{v.vehicleId}</p>
                          <p className="text-[10px]" style={{ color: 'var(--lo-text-secondary)' }}>{route?.name || '—'}</p>
                        </div>
                        {alreadySaved ? (
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-900">Saved</span>
                        ) : (
                          <button type="button" onClick={() => addSavedFromSearch(v)}
                            className="min-h-11 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700">
                            <Plus size={11} className="mr-1 inline" />Add
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Edit My Details modal ---- */}
      {editingDetails && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/35 backdrop-blur-sm sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Edit details" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:mx-4 sm:max-w-sm sm:rounded-2xl sm:pb-0">
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Details</h3>
              <button type="button" onClick={() => setEditingDetails(false)} aria-label="Close edit details dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"><X size={20} /></button>
            </header>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Full name</span>
                <input value={detailDraft.fullName} onChange={(e) => setDetailDraft((d) => ({ ...d, fullName: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Mobile</span>
                <input value={detailDraft.phone} onChange={(e) => setDetailDraft((d) => ({ ...d, phone: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <button type="button" onClick={() => setEditingDetails(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-900">Cancel</button>
              <button type="button" onClick={saveDetails} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700">Save</button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
