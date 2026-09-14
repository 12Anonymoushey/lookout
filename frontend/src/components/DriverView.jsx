import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, TileLayer } from 'react-leaflet';
import {
  AlertTriangle,
  Banknote,
  Check,
  ChevronDown,
  Clock,
  Crosshair,
  DollarSign,
  Edit3,
  Fuel,
  Loader2,
  Megaphone,
  Pencil,
  Play,
  Plus,
  Satellite,
  Send,
  Square,
  Star,
  Trash2,
  TrendingUp,
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
import { KebabMenu, SearchSortBar, ConfirmToast } from './KebabMenu.jsx';
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, getDriverAnnouncements, getAllAnnouncements } from '../services/announcementService.js';

const ILOILO_CENTER = [10.7202, 122.5621];
const TICK_MS = 3000;

const fmtCoord = (n) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toFixed(6));
const fmtDuration = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export default function DriverView({ routes, connected, drawerOpen, onCloseDrawer, collapsed, onToggleCollapse }) {
  const { profile, plates, activePlate, setPlates, setActivePlate, updateDetails } = useAuth();

  const [routeId, setRouteId] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [simEnabled, setSimEnabled] = useState(false);
  const [telemetry, setTelemetry] = useState({ lat: null, lng: null, speed: 0, heading: 0 });
  const [accuracy, setAccuracy] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [sentCount, setSentCount] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);
  const [full, setFull] = useState(false);
  const [toast, setToast] = useState('');

  // Edit My Details
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailDraft, setDetailDraft] = useState({ fullName: '', phone: '' });

  // Trips (was rides)
  const [trips, setTrips] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_driver_trips') || '[]'); } catch { return []; }
  });
  const [tripSearch, setTripSearch] = useState('');
  const [tripSort, setTripSort] = useState({ field: 'startedAt', dir: 'desc' });
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripDraft, setTripDraft] = useState({ revenue: '', income: '', gas: '', others: '' });

  // Announcements
  const [myAnnouncements, setMyAnnouncements] = useState([]);
  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [editingAnnounce, setEditingAnnounce] = useState(null);
  const [announceDraft, setAnnounceDraft] = useState({ title: '', message: '' });

  const refreshAnnouncements = () => {
    if (profile?.uid) setMyAnnouncements(getDriverAnnouncements(profile.uid));
    setAllAnnouncements(getAllAnnouncements());
  };
  useEffect(() => { refreshAnnouncements(); }, [profile?.uid]);

  const watchIdRef = useRef(null);
  const tickRef = useRef(null);
  const latestFixRef = useRef(null);
  const simRef = useRef({ travelledKm: 0 });
  const metaRef = useRef(null);
  const simFlagRef = useRef(false);
  const isLiveRef = useRef(false);
  const fullRef = useRef(false);
  const routesRef = useRef(routes);
  const routeIdRef = useRef(routeId);
  const miniMapRef = useRef(null);

  useEffect(() => { routesRef.current = routes; }, [routes]);
  useEffect(() => { routeIdRef.current = routeId; }, [routeId]);
  useEffect(() => { fullRef.current = full; }, [full]);
  useEffect(() => { if (!routeId && routes.length > 0) setRouteId(routes[0].id); }, [routes, routeId]);
  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id); }, [toast]);

  const selectedRoute = useMemo(() => routes.find((r) => r.id === routeId) ?? null, [routes, routeId]);

  const pushFix = useCallback((fix) => {
    latestFixRef.current = fix;
    setTelemetry({ lat: fix.lat, lng: fix.lng, speed: fix.speed, heading: fix.heading });
  }, []);

  const startGeoWatch = useCallback(() => {
    if (!('geolocation' in navigator)) { setGpsStatus('denied'); setError('Browser does not support geolocation.'); return; }
    setGpsStatus('acquiring');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const prev = latestFixRef.current;
        let speedKmh = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : 0;
        if ((!speedKmh || speedKmh < 0) && prev) {
          const dtSec = (pos.timestamp - prev.timestamp) / 1000;
          if (dtSec > 0.5) speedKmh = (haversineKm(prev.lat, prev.lng, c.latitude, c.longitude) / dtSec) * 3600;
        }
        const heading = c.heading != null && !Number.isNaN(c.heading) ? c.heading : prev ? bearingDeg(prev.lat, prev.lng, c.latitude, c.longitude) : 0;
        pushFix({ lat: c.latitude, lng: c.longitude, speed: Math.max(0, speedKmh), heading, timestamp: pos.timestamp });
        setAccuracy(c.accuracy ?? null);
        setGpsStatus('locked');
        setError('');
      },
      (err) => { setGpsStatus('denied'); setError(`${err.message}. Use GPS simulator instead.`); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, [pushFix]);

  const stopGeoWatch = useCallback(() => {
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }, []);

  const emitFix = useCallback((fix) => {
    const meta = metaRef.current;
    if (!meta) return;
    socket.emit('updateLocation', { vehicleId: meta.vehicleId, routeId: meta.routeId, lat: fix.lat, lng: fix.lng, speed: Math.round(fix.speed * 10) / 10, heading: Math.round(fix.heading), full: fullRef.current });
    setSentCount((n) => n + 1);
  }, []);

  const runTick = useCallback(() => {
    if (simFlagRef.current) {
      const route = routesRef.current.find((r) => r.id === routeIdRef.current);
      if (!route || route.stops.length < 2) return;
      const points = route.stops.map((s) => [s.lat, s.lng]);
      const state = simRef.current;
      const speedKmh = 22 + 9 * Math.abs(Math.sin(state.travelledKm * 2.2)) + Math.random() * 4;
      state.travelledKm = (state.travelledKm + speedKmh * (TICK_MS / 3_600_000)) % pathLengthKm(points);
      const point = pointAtDistance(points, state.travelledKm);
      if (!point) return;
      const fix = { lat: point.lat, lng: point.lng, speed: Math.max(0, speedKmh + (Math.random() - 0.5) * 4), heading: point.bearing, timestamp: Date.now() };
      pushFix(fix);
      emitFix(fix);
    } else {
      const fix = latestFixRef.current;
      if (fix) emitFix(fix);
    }
  }, [emitFix, pushFix]);

  const saveTrip = useCallback((tripData) => {
    const next = [tripData, ...trips].slice(0, 100);
    setTrips(next);
    localStorage.setItem('lo_driver_trips', JSON.stringify(next));
  }, [trips]);

  const beginTrip = () => {
    const vid = activePlate.trim().toUpperCase();
    if (!vid) { setError('Add a plate number first.'); return; }
    if (!routeIdRef.current) { setError('Select a route.'); return; }
    setError('');
    metaRef.current = { vehicleId: vid, routeId: routeIdRef.current };
    isLiveRef.current = true;
    setIsLive(true);
    setStartedAt(Date.now());
    setElapsed(0);
    setSentCount(0);
    if (!simFlagRef.current) startGeoWatch();
    runTick();
    tickRef.current = setInterval(runTick, TICK_MS);
    setToast('Trip started');
  };

  const endTrip = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    stopGeoWatch();
    const vid = metaRef.current?.vehicleId;
    if (vid) socket.emit('endTrip', { vehicleId: vid });

    if (startedAt) {
      const trip = {
        id: Date.now().toString(),
        vehicleId: vid,
        routeId: routeIdRef.current,
        routeName: routesRef.current.find((r) => r.id === routeIdRef.current)?.name || '—',
        startedAt: new Date(startedAt).toLocaleString(),
        endedAt: new Date().toLocaleString(),
        duration: fmtDuration(Math.floor((Date.now() - startedAt) / 1000)),
        fixes: sentCount,
        pokesReceived: 0,
        revenue: 0,
        income: 0,
        gas: 0,
        others: 0,
      };
      saveTrip(trip);
      setToast(`Trip ended · ${trip.duration}`);
    }

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
    if (next) { stopGeoWatch(); simRef.current = { travelledKm: 0 }; }
    else if (isLiveRef.current) startGeoWatch();
    setToast(next ? 'GPS simulator ON' : 'GPS simulator OFF');
  };

  const setAvailability = useCallback((nextFull) => {
    setFull(nextFull);
    fullRef.current = nextFull;
    const meta = metaRef.current;
    if (meta) socket.emit('setAvailability', { vehicleId: meta.vehicleId, full: nextFull });
    setToast(nextFull ? 'Marked Full' : 'Marked Vacant');
  }, []);

  useEffect(() => {
    if (!isLive) return undefined;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isLive, startedAt]);

  useEffect(() => {
    if (follow && isLive && miniMapRef.current && telemetry.lat != null) {
      miniMapRef.current.setView([telemetry.lat, telemetry.lng], 15, { animate: true, duration: 0.8 });
    }
  }, [follow, isLive, telemetry.lat, telemetry.lng]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    const vid = metaRef.current?.vehicleId;
    if (vid && isLiveRef.current) socket.emit('endTrip', { vehicleId: vid });
  }, []);

  /* ---- Announcement CRUD ---- */
  const submitAnnouncement = () => {
    if (!announceTitle.trim() || !announceMessage.trim()) return;
    createAnnouncement({ driverUid: profile.uid, driverName: profile.fullName || 'Driver', plate: activePlate || '—', title: announceTitle.trim(), message: announceMessage.trim() });
    setAnnounceTitle('');
    setAnnounceMessage('');
    refreshAnnouncements();
    setToast('Announcement posted');
  };
  const saveEditedAnnounce = () => {
    if (!editingAnnounce) return;
    updateAnnouncement(editingAnnounce.id, { title: announceDraft.title.trim(), message: announceDraft.message.trim() });
    setEditingAnnounce(null);
    refreshAnnouncements();
    setToast('Announcement updated');
  };
  const removeAnnouncement = (id) => {
    deleteAnnouncement(id);
    refreshAnnouncements();
    setToast('Announcement deleted');
  };

  const gpsBadge = {
    idle: { icon: Satellite, spin: false, text: 'GPS idle', cls: 'text-[var(--lo-text-secondary)]' },
    acquiring: { icon: Loader2, spin: true, text: 'Acquiring…', cls: 'text-amber-600' },
    locked: { icon: Satellite, spin: false, text: accuracy ? `GPS ±${Math.round(accuracy)}m` : 'GPS locked', cls: 'text-emerald-600' },
    denied: { icon: X, spin: false, text: 'GPS unavailable', cls: 'text-rose-500' },
  }[gpsStatus];

  /* ---- Edit My Details ---- */
  const openDetailEditor = () => { setDetailDraft({ fullName: profile?.fullName || '', phone: profile?.phone || '' }); setEditingDetails(true); };
  const saveDetails = async () => {
    try {
      await updateDetails({ fullName: detailDraft.fullName.trim(), phone: detailDraft.phone.trim() });
      setToast('Details updated');
      setEditingDetails(false);
    } catch { setToast('Could not update details'); }
  };

  /* ---- Trip stats ---- */
  const tripStats = useMemo(() => {
    if (trips.length === 0) return null;
    const durations = trips.map((t) => { const p = t.duration.split(':'); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0); });
    const totalRevenue = trips.reduce((s, t) => s + (Number(t.revenue) || 0), 0);
    const totalIncome = trips.reduce((s, t) => s + (Number(t.income) || 0), 0);
    const totalGas = trips.reduce((s, t) => s + (Number(t.gas) || 0), 0);
    const totalOthers = trips.reduce((s, t) => s + (Number(t.others) || 0), 0);
    return { total: trips.length, totalRevenue, totalIncome, totalGas, totalOthers, net: totalIncome - totalGas - totalOthers };
  }, [trips]);

  const filteredTrips = useMemo(() => {
    let list = trips;
    if (tripSearch) { const q = tripSearch.toLowerCase(); list = list.filter((t) => [t.vehicleId, t.routeName].some((f) => String(f).toLowerCase().includes(q))); }
    list = [...list].sort((a, b) => { const va = a[tripSort.field] ?? ''; const vb = b[tripSort.field] ?? ''; return tripSort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va)); });
    return list;
  }, [trips, tripSearch, tripSort]);

  const updateTripFinancials = () => {
    if (!editingTrip) return;
    const next = trips.map((t) => t.id === editingTrip.id ? { ...t, revenue: Number(tripDraft.revenue) || 0, income: Number(tripDraft.income) || 0, gas: Number(tripDraft.gas) || 0, others: Number(tripDraft.others) || 0 } : t);
    setTrips(next);
    localStorage.setItem('lo_driver_trips', JSON.stringify(next));
    setToast('Trip finances updated');
    setEditingTrip(null);
  };

  const removeTrip = (id) => {
    const next = trips.filter((t) => t.id !== id);
    setTrips(next);
    localStorage.setItem('lo_driver_trips', JSON.stringify(next));
    setToast('Trip removed');
  };

  /* ---- Detail editor draft auto-sync ---- */
  useEffect(() => { if (editingDetails) setDetailDraft({ fullName: profile?.fullName || '', phone: profile?.phone || '' }); }, [editingDetails, profile]);

  /* ======================== SIDEBAR ======================== */
  const panel = (
    <>
      {/* Tab 1: My Details (editable) */}
      <Section icon={UserRound} title="My Details" tint="pink">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Mobile" value={profile?.phone || '—'} />
        <InfoRow label="Account" value="driver" />
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>Trip</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ borderColor: isLive ? 'rgba(16,185,129,0.4)' : 'var(--lo-card-border)', background: isLive ? 'rgba(16,185,129,0.1)' : 'var(--lo-card)', color: isLive ? '#059669' : 'var(--lo-text-secondary)' }}>
            {isLive && <PulseDot color="emerald" />}{isLive ? 'On air' : 'Offline'}
          </span>
        </div>
        <button type="button" onClick={openDetailEditor}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-bold transition hover:opacity-80"
          style={{ borderColor: 'var(--lo-pink)', color: 'var(--lo-pink)' }}>
          <Pencil size={12} /> Edit Details
        </button>
      </Section>

      <PlateManager plates={plates} activePlate={activePlate} onSelect={setActivePlate} onChange={setPlates} disabled={isLive} />

      {/* Tab 2: Start Ride */}
      <Section icon={Play} title="Start Ride" tint="cyan">
        {!connected && <p className="rounded-xl border px-2.5 py-2 text-[10px]" style={{ borderColor: '#f59e0b40', background: '#f59e0b10', color: '#b45309' }}>Backend not connected.</p>}
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>Route</span>
          <span className="relative block">
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={isLive || routes.length === 0}
              className="w-full appearance-none rounded-xl border px-3 py-2 pr-8 text-xs focus:border-[var(--lo-pink)] focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }}>
              {routes.length === 0 && <option value="">Loading routes…</option>}
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--lo-text-secondary)' }} />
          </span>
        </label>
        <button type="button" onClick={isLive ? endTrip : beginTrip}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold shadow-lg transition ${isLive ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}>
          {isLive ? <><Square size={14} /> End Trip</> : <><Play size={14} /> Start Trip</>}
        </button>
        <button type="button" onClick={toggleSim}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-semibold transition"
          style={{ borderColor: simEnabled ? 'var(--lo-pink)' : 'var(--lo-card-border)', background: simEnabled ? 'rgba(255,102,161,0.1)' : 'var(--lo-card)', color: 'var(--lo-text)' }}>
          <Satellite size={13} /> {simEnabled ? 'GPS Sim ON' : 'GPS Simulator'}
        </button>
        {error && (
          <p className="flex items-start gap-1.5 rounded-xl border px-2.5 py-2 text-[10px]" style={{ borderColor: '#ef444440', background: '#ef444410', color: '#dc2626' }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <div className="space-y-1.5 rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
          <InfoRow label="Latitude" value={fmtCoord(telemetry.lat)} mono />
          <InfoRow label="Longitude" value={fmtCoord(telemetry.lng)} mono />
          <InfoRow label="Speed" value={`${telemetry.speed.toFixed(1)} km/h`} mono />
          <InfoRow label="Heading" value={`${Math.round(telemetry.heading)}° ${cardinal(telemetry.heading)}`} mono />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[{ icon: Send, val: sentCount, lbl: 'sent' }, { icon: Clock, val: fmtDuration(elapsed), lbl: 'trip' }, { icon: gpsBadge.icon, val: gpsBadge.text, lbl: 'gps', cls: gpsBadge.cls, spin: gpsBadge.spin }].map((g, i) => (
            <div key={i} className="rounded-xl border p-2 text-center" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
              <g.icon size={12} className={`mx-auto mb-1 ${g.cls || ''} ${g.spin ? 'animate-spin' : ''}`} style={!g.cls ? { color: 'var(--lo-pink)' } : undefined} />
              <p className={`font-mono text-xs font-bold ${g.cls || ''}`} style={!g.cls ? { color: 'var(--lo-text)' } : undefined}>{g.val}</p>
              <p className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>{g.lbl}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Tab 3: Trips */}
      <Section icon={Clock} title="Trips" tint="cyan" defaultOpen={false}>
        <SearchSortBar search={tripSearch} onSearchChange={setTripSearch} sortField={tripSort.field} sortDir={tripSort.dir}
          onSortToggle={(field, dir) => setTripSort({ field, dir })} fields={['vehicleId', 'routeName', 'startedAt']} placeholder="Search trips…" />
        {filteredTrips.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>{trips.length === 0 ? 'No trips yet. Start a trip!' : 'No matches.'}</p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 px-2 text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>
              <span>Trip</span><span>Duration</span><span>Revenue</span><span></span>
            </div>
            {filteredTrips.map((t) => (
              <div key={t.id} className="rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{t.vehicleId} · {t.routeName}</p>
                    <p className="text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>{t.startedAt} → {t.endedAt}</p>
                  </div>
                  <KebabMenu items={[
                    { icon: Banknote, label: 'Edit finances', onClick: () => { setEditingTrip(t); setTripDraft({ revenue: String(t.revenue || ''), income: String(t.income || ''), gas: String(t.gas || ''), others: String(t.others || '') }); } },
                    { icon: Trash2, label: 'Remove', danger: true, onClick: () => removeTrip(t.id) },
                  ]} />
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {[{ label: 'Revenue', val: `₱${t.revenue || 0}` }, { label: 'Income', val: `₱${t.income || 0}` }, { label: 'Gas', val: `₱${t.gas || 0}` }, { label: 'Others', val: `₱${t.others || 0}` }].map((f) => (
                    <div key={f.label} className="rounded-lg px-1.5 py-1 text-center" style={{ background: 'rgba(255,102,161,0.05)' }}>
                      <p className="font-mono text-[10px] font-bold" style={{ color: 'var(--lo-text)' }}>{f.val}</p>
                      <p className="text-[8px] uppercase" style={{ color: 'var(--lo-text-secondary)' }}>{f.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Tab 4: Stats */}
      <Section icon={Star} title="Stats" tint="yellow" defaultOpen={false}>
        {tripStats ? (
          <div className="space-y-1.5">
            <InfoRow label="Total trips" value={tripStats.total} />
            <InfoRow label="Total revenue" value={`₱${tripStats.totalRevenue}`} />
            <InfoRow label="Total income" value={`₱${tripStats.totalIncome}`} />
            <InfoRow label="Total gas" value={`₱${tripStats.totalGas}`} />
            <InfoRow label="Total others" value={`₱${tripStats.totalOthers}`} />
            <div className="mt-1 rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,102,161,0.08)' }}>
              <InfoRow label="Net" value={<span className={`font-bold ${tripStats.net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>₱{tripStats.net}</span>} />
            </div>
          </div>
        ) : (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>Complete trips to see stats.</p>
        )}
      </Section>

      <Section icon={Users} title="Passenger Status" tint={full ? 'rose' : 'sky'}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAvailability(false)} aria-pressed={!full}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${!full ? 'shadow-lg' : 'border hover:opacity-80'}`}
            style={!full ? { background: 'var(--lo-sky)', color: 'var(--lo-text)' } : { borderColor: 'var(--lo-card-border)', color: 'var(--lo-text)' }}>
            <Users size={14} /> Still Vacant
          </button>
          <button type="button" onClick={() => setAvailability(true)} aria-pressed={full}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${full ? 'bg-rose-500 text-white shadow-lg' : 'border hover:opacity-80'}`}
            style={!full ? { borderColor: 'var(--lo-card-border)', color: 'var(--lo-text)' } : undefined}>
            <Users size={14} /> Full
          </button>
        </div>
      </Section>

      {/* Tab: Make Announcement */}
      <Section icon={Megaphone} title="Make Announcement" tint="pink" defaultOpen={false}>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Title</span>
          <input value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} placeholder="e.g. Route diversion today"
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
            style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Message</span>
          <textarea value={announceMessage} onChange={(e) => setAnnounceMessage(e.target.value)} placeholder="Details for commuters…" rows={3}
            className="w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
            style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
        </label>
        <button type="button" onClick={submitAnnouncement} disabled={!announceTitle.trim() || !announceMessage.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition hover:opacity-80 disabled:opacity-40"
          style={{ background: 'var(--lo-pink)' }}>
          <Megaphone size={13} /> Post Announcement
        </button>
      </Section>

      {/* Tab: My Announcements */}
      <Section icon={Megaphone} title="My Announcements" tint="cyan" defaultOpen={false}>
        {myAnnouncements.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>No announcements yet.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {myAnnouncements.map((a) => (
              <div key={a.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{a.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>{a.message}</p>
                    <p className="mt-1 text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>{a.plate} · {a.createdAt}</p>
                  </div>
                  <KebabMenu items={[
                    { icon: Pencil, label: 'Edit', onClick: () => { setEditingAnnounce(a); setAnnounceDraft({ title: a.title, message: a.message }); } },
                    { icon: Trash2, label: 'Delete', danger: true, onClick: () => removeAnnouncement(a.id) },
                  ]} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Tab: All Announcements (driver sees all too) */}
      <Section icon={Megaphone} title="All Announcements" tint="sky" defaultOpen={false}>
        {allAnnouncements.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>No announcements.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {allAnnouncements.map((a) => (
              <div key={a.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
                <p className="truncate text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{a.title}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: 'var(--lo-text-secondary)' }}>{a.message}</p>
                <p className="mt-1 text-[9px]" style={{ color: 'var(--lo-text-secondary)' }}>{a.driverName} · {a.plate} · {a.createdAt}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );

  /* ======================== MAP STAGE ======================== */
  return (
    <AppShell brand="Driver" panel={panel} open={drawerOpen} onCloseDrawer={onCloseDrawer} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <section className="absolute inset-0">
        <MapContainer center={ILOILO_CENTER} zoom={13} className="h-full w-full" zoomControl={false} ref={miniMapRef}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {selectedRoute && <Polyline positions={selectedRoute.stops.map((s) => [s.lat, s.lng])} color={selectedRoute.color} weight={3} opacity={0.45} dashArray={selectedRoute.loop ? '8 10' : undefined} />}
          {telemetry.lat != null && selectedRoute && (
            <VehicleMarker vehicle={{ vehicleId: metaRef.current?.vehicleId ?? (activePlate || 'YOU'), lat: telemetry.lat, lng: telemetry.lng, speed: telemetry.speed, heading: telemetry.heading, updatedAt: Date.now(), full }} route={selectedRoute} />
          )}
        </MapContainer>

        <div className="pointer-events-none absolute left-2 right-2 top-2 z-[1000] flex flex-wrap items-center gap-2 lg:left-3 lg:top-3">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border px-3 shadow-xl backdrop-blur" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
            <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${isLive ? 'text-emerald-600' : ''}`} style={!isLive ? { color: 'var(--lo-text-secondary)' } : undefined}>
              {isLive ? <PulseDot color="emerald" /> : <Satellite size={12} />}{isLive ? 'On air' : 'Offline'}
            </span>
            <span className="h-4 w-px" style={{ background: 'var(--lo-card-border)' }} />
            <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{metaRef.current?.vehicleId ?? activePlate ?? 'no plate'}</span>
            {isLive && <><span className="h-4 w-px" style={{ background: 'var(--lo-card-border)' }} /><span className="font-mono text-[10px]" style={{ color: 'var(--lo-text-secondary)' }}>{telemetry.speed.toFixed(0)} km/h · {sentCount} sent</span></>}
          </div>
        </div>

        <div className="absolute right-2 top-2 z-[1000] lg:right-3 lg:top-3">
          <button type="button" onClick={() => setFollow((f) => !f)}
            className="flex h-10 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur transition"
            style={{ borderColor: follow ? 'var(--lo-pink)' : 'var(--lo-card-border)', background: follow ? 'rgba(255,102,161,0.1)' : 'var(--lo-panel)', color: follow ? 'var(--lo-pink)' : 'var(--lo-text)' }}>
            <Crosshair size={13} /> {follow ? 'Following' : 'Free pan'}
          </button>
        </div>

        {telemetry.lat == null && (
          <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center">
            <div className="rounded-2xl border px-5 py-4 text-center shadow-xl backdrop-blur" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
              <Satellite size={22} className="mx-auto mb-1.5 animate-pulse" style={{ color: 'var(--lo-pink)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--lo-text)' }}>Waiting for GPS fix…</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--lo-text-secondary)' }}>Start a trip from the panel.</p>
            </div>
          </div>
        )}
      </section>

      <div className="pointer-events-none fixed bottom-7 right-2 z-[1200] flex flex-col items-end gap-2.5 sm:right-4 lg:bottom-8 lg:right-5">
        <DriverPokes plate={activePlate} className="pointer-events-auto" />
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border p-1.5 shadow-xl backdrop-blur" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
          <button type="button" onClick={() => setAvailability(false)} aria-pressed={!full}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${!full ? 'shadow-lg' : 'hover:opacity-80'}`}
            style={!full ? { background: 'var(--lo-sky)', color: 'var(--lo-text)' } : { color: 'var(--lo-text)' }}>
            <Users size={14} /> Still Vacant
          </button>
          <button type="button" onClick={() => setAvailability(true)} aria-pressed={full}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${full ? 'bg-rose-500 text-white shadow-lg' : 'hover:opacity-80'}`}
            style={!full ? { color: 'var(--lo-text)' } : undefined}>
            <Users size={14} /> Full
          </button>
        </div>
      </div>

      <ConfirmToast message={toast} onClose={() => setToast('')} />

      {/* ---- Edit My Details modal ---- */}
      {editingDetails && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(58,40,0,0.4)' }}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Details</h3>
              <button type="button" onClick={() => setEditingDetails(false)} className="rounded-lg p-1" style={{ color: 'var(--lo-text-secondary)' }}><X size={16} /></button>
            </header>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Full name</span>
                <input value={detailDraft.fullName} onChange={(e) => setDetailDraft((d) => ({ ...d, fullName: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Mobile</span>
                <input value={detailDraft.phone} onChange={(e) => setDetailDraft((d) => ({ ...d, phone: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <button type="button" onClick={() => setEditingDetails(false)} className="rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--lo-card-border)', color: 'var(--lo-text)' }}>Cancel</button>
              <button type="button" onClick={saveDetails} className="rounded-xl px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--lo-pink)' }}>Save</button>
            </footer>
          </div>
        </div>
      )}

      {/* ---- Edit Trip Finances modal ---- */}
      {editingTrip && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(58,40,0,0.4)' }}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Trip Finances</h3>
              <button type="button" onClick={() => setEditingTrip(null)} className="rounded-lg p-1" style={{ color: 'var(--lo-text-secondary)' }}><X size={16} /></button>
            </header>
            <div className="space-y-3 p-4">
              {[
                { key: 'revenue', label: 'Revenue (₱)', icon: Banknote },
                { key: 'income', label: 'Income (₱)', icon: TrendingUp },
                { key: 'gas', label: 'Gas (₱)', icon: Fuel },
                { key: 'others', label: 'Others (₱)', icon: DollarSign },
              ].map(({ key, label, icon: I }) => (
                <label key={key} className="block">
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}><I size={11} /> {label}</span>
                  <input type="number" value={tripDraft[key]} onChange={(e) => setTripDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
                    style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
                </label>
              ))}
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <button type="button" onClick={() => setEditingTrip(null)} className="rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--lo-card-border)', color: 'var(--lo-text)' }}>Cancel</button>
              <button type="button" onClick={updateTripFinancials} className="rounded-xl px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--lo-pink)' }}>Save</button>
            </footer>
          </div>
        </div>
      )}

      {/* ---- Edit Announcement modal ---- */}
      {editingAnnounce && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(58,40,0,0.4)' }}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-panel)' }}>
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Announcement</h3>
              <button type="button" onClick={() => setEditingAnnounce(null)} className="rounded-lg p-1" style={{ color: 'var(--lo-text-secondary)' }}><X size={16} /></button>
            </header>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Title</span>
                <input value={announceDraft.title} onChange={(e) => setAnnounceDraft((d) => ({ ...d, title: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Message</span>
                <textarea value={announceDraft.message} onChange={(e) => setAnnounceDraft((d) => ({ ...d, message: e.target.value }))} rows={3}
                  className="w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--lo-pink)]/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <button type="button" onClick={() => setEditingAnnounce(null)} className="rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--lo-card-border)', color: 'var(--lo-text)' }}>Cancel</button>
              <button type="button" onClick={saveEditedAnnounce} className="rounded-xl px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--lo-pink)' }}>Save</button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
