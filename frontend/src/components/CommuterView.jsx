import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import {
  Bookmark,
  Bus,
  Clock,
  CloudRain,
  Hand,
  LocateFixed,
  MapPin,
  Radio,
  Route,
  Megaphone,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import AppShell, { AnimatedPopup, InfoRow, ProfileScreen, Section } from './AppShell.jsx';
import VehicleMarker from './VehicleMarker.jsx';
import AntiBunchingSpatialLayer from './AntiBunchingSpatialLayer.jsx';
import EmergencyRadio from './EmergencyRadio.jsx';
import WeatherTab from './WeatherTab.jsx';
import { ExpandableListCard, SearchSortBar } from './KebabMenu.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sendPoke } from '../services/pokeService.js';
import { firebaseReady } from '../services/firebase.js';
import {
  deleteAnalyticsRecord,
  mergeOwnedAnalyticsRecords,
  saveAnalyticsRecord,
  watchOwnAnalyticsRecords,
} from '../services/analyticsService.js';
import { getAllAnnouncements } from '../services/announcementService.js';
import { statusMeta } from '../utils/vehicle.js';
import {
  etaMinutes,
  formatKm,
  haversineKm,
  loopPositions,
} from '../utils/geo.js';

const ILOILO_CENTER = [10.7202, 122.5621];
const FRESH_WINDOW_MS = 90_000;
const POKE_RANGE_KM = 4;
const POKE_COOLDOWN_MS = 6_000;
const RIDING_DISTANCE_KM = 0.08;
const RIDE_EXIT_DISTANCE_KM = 0.15;
const RIDE_DISAPPEAR_CONFIRM_MS = 5_000;
const RIDING_CONFIRM_MS = 15_000;
const RIDE_EXIT_CONFIRM_MS = 20_000;

function rideDate(ride) {
  return new Date(ride.endedAt || ride.rideAt || ride.startedAt || ride.lastTrip || ride.time || 0);
}

function formatRideDate(ride) {
  const date = rideDate(ride);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
}

function RideCharts({ rides }) {
  const routeCounts = rides.reduce((counts, ride) => {
    const routeName = ride.operatorName || ride.routeName || 'Unknown route';
    counts[routeName] = (counts[routeName] || 0) + 1;
    return counts;
  }, {});
  const routeEntries = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]);
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const total = rides.length;
  let offset = 0;
  const stops = routeEntries.map(([, count], index) => {
    const start = offset;
    offset += total ? (count / total) * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const daily = days.map((date) => ({
    date,
    count: rides.filter((ride) => {
      const rideTime = rideDate(ride);
      return rideTime.toDateString() === date.toDateString();
    }).length,
  }));
  const maxDaily = Math.max(1, ...daily.map((day) => day.count));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRides = rides.filter((ride) => rideDate(ride) >= todayStart);
  const todayMinutes = todayRides.reduce((sum, ride) => {
    const duration = ride.durationMinutes ?? (ride.startedAt && ride.endedAt ? (ride.endedAt - ride.startedAt) / 60000 : 0);
    return sum + Math.max(0, duration || 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Routes ridden</p>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 shrink-0 rounded-full" style={{ background: total ? `conic-gradient(${stops.join(', ')})` : '#e2e8f0' }} />
          <div className="min-w-0 space-y-1">
            {routeEntries.map(([routeName, count], index) => (
              <div key={routeName} className="flex items-center gap-2 text-[10px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="truncate text-slate-600">{routeName}</span>
                <strong className="ml-auto text-slate-900">{count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Daily rides · last 7 days</p>
        <div className="flex h-28 items-end gap-2 rounded-xl bg-slate-50 px-2 pt-3">
          {daily.map((day) => (
            <div key={day.date.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9px] font-bold text-slate-700">{day.count}</span>
              <div className="w-full max-w-8 rounded-t-md bg-blue-600" style={{ height: `${Math.max(day.count ? 18 : 3, (day.count / maxDaily) * 70)}px` }} />
              <span className="pb-1 text-[9px] text-slate-500">{day.date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Today</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{todayRides.length}</p>
        <p className="text-[10px] text-slate-500">rides · {todayMinutes.toFixed(todayMinutes % 1 ? 1 : 0)} minutes ridden</p>
      </div>
    </div>
  );
}

const meIcon = L.divIcon({
  className: 'lo-me-wrapper',
  html: `<div class="lo-me"><span class="lo-me__pin">${renderToStaticMarkup(<MapPin size={24} strokeWidth={2.5} />)}</span><span class="lo-me__label">You are here</span></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
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
  radioLogs = [],
  playingRadioId = '',
  utilityProfile,
}) {
  const { profile, role, updateDetails } = useAuth();

  // Edit My Details
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailDraft, setDetailDraft] = useState({ fullName: '', phone: '' });
  const [routeFilter, setRouteFilter] = useState('all');
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [tick, setTick] = useState(0);
  const [myLocation, setMyLocation] = useState(null);
  const [locState, setLocState] = useState('idle');
  const [pokes, setPokes] = useState({});
  const [toast, setToast] = useState('');
  const [weather, setWeather] = useState({ loading: true, precipitation: null });
  const [routeEtaMinutes, setRouteEtaMinutes] = useState(null);
  const [routeEtaLoading, setRouteEtaLoading] = useState(false);

  // Saved PUVs
  const [savedTransports, setSavedTransports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_saved_transports') || '[]'); } catch { return []; }
  });
  const [savedSearch, setSavedSearch] = useState('');
  const [savedSort, setSavedSort] = useState({ field: 'plate', dir: 'asc' });
  const [selectedSaved, setSelectedSaved] = useState([]);
  const [selectedRecent, setSelectedRecent] = useState([]);
  const [bulkRideConfirm, setBulkRideConfirm] = useState('');

  // Recent Rides
  const [recentRides, setRecentRides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_recent_rides') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    if (!firebaseReady || !profile?.uid) return undefined;
    return watchOwnAnalyticsRecords(
      profile.uid,
      (records) => {
        const cloudRides = records.filter((record) => record.recordType === 'ride');
        setRecentRides((current) => {
          const next = mergeOwnedAnalyticsRecords(current, cloudRides, profile.uid);
          localStorage.setItem('lo_recent_rides', JSON.stringify(next));
          return next;
        });
      },
      (syncError) => setToast(`Could not load cloud ride analytics: ${syncError.message}`),
    );
  }, [profile?.uid]);
  const [recentSearch, setRecentSearch] = useState('');
  const [recentSort, setRecentSort] = useState({ field: 'plate', dir: 'asc' });
  const [activeRide, setActiveRide] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lo_active_ride') || 'null'); } catch { return null; }
  });
  const rideCandidateRef = useRef(null);
  const rideExitCandidateRef = useRef(null);

  // Announcements
  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => { setAnnouncements(getAllAnnouncements()); }, []);

  const mapRef = useRef(null);
  const hasCenteredOnUserLocation = useRef(false);
  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const visibleVehicles = useMemo(
    () => vehicles.filter((v) => Date.now() - (v.updatedAt ?? 0) < FRESH_WINDOW_MS && (routeFilter === 'all' || v.routeId === routeFilter)),
    [vehicles, routeFilter],
  );

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!myLocation) return;

    if (!activeRide && visibleVehicles.length === 0) return;

    const nearest = visibleVehicles
      .map((vehicle) => ({
        vehicle,
        distanceKm: haversineKm(myLocation.lat, myLocation.lng, vehicle.lat, vehicle.lng),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    if (!activeRide) {
      if (nearest.distanceKm <= RIDING_DISTANCE_KM) {
        const plate = nearest.vehicle.vehicleId;
        if (rideCandidateRef.current?.plate !== plate) {
          rideCandidateRef.current = { plate, since: Date.now() };
        } else if (Date.now() - rideCandidateRef.current.since >= RIDING_CONFIRM_MS) {
          const ride = {
            ...vehicleToRow(nearest.vehicle, routeById, now()),
            plate: plate,
            ownerUid: profile?.uid,
            startedAt: Date.now(),
            status: 'riding',
            rideAt: Date.now(),
          };
          localStorage.setItem('lo_active_ride', JSON.stringify(ride));
          setActiveRide(ride);
          rideCandidateRef.current = null;
        }
      } else {
        rideCandidateRef.current = null;
      }
      return;
    }

    const activeVehicle = vehicles.find((vehicle) =>
      vehicle.vehicleId === activeRide.plate &&
      Date.now() - (vehicle.updatedAt ?? 0) < FRESH_WINDOW_MS,
    );
    const distanceKm = activeVehicle
      ? haversineKm(myLocation.lat, myLocation.lng, activeVehicle.lat, activeVehicle.lng)
      : Number.POSITIVE_INFINITY;

    if (distanceKm <= RIDE_EXIT_DISTANCE_KM) {
      rideExitCandidateRef.current = null;
    } else if (!rideExitCandidateRef.current) {
      rideExitCandidateRef.current = Date.now();
    } else if (Date.now() - rideExitCandidateRef.current >= (!activeVehicle ? RIDE_DISAPPEAR_CONFIRM_MS : RIDE_EXIT_CONFIRM_MS)) {
      const endedAt = Date.now();
      const rideId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      const ride = {
        ...activeRide,
        id: rideId,
        ownerUid: profile?.uid || activeRide.ownerUid,
        recordType: 'ride',
        recordId: rideId,
        endedAt,
        rideAt: activeRide.startedAt || Date.now(),
        durationMinutes: Math.max(0, (endedAt - activeRide.startedAt) / 60000),
        lastTrip: new Date(endedAt).toLocaleString(),
        status: 'completed',
      };
      setRecentRides((current) => {
        const next = [ride, ...current].slice(0, 50);
        localStorage.setItem('lo_recent_rides', JSON.stringify(next));
        return next;
      });
      if (firebaseReady && ride.ownerUid) {
        saveAnalyticsRecord(ride.ownerUid, 'ride', ride)
          .catch((syncError) => setToast(`Ride saved locally, but cloud sync failed: ${syncError.message}`));
      }
      localStorage.removeItem('lo_active_ride');
      setActiveRide(null);
      rideExitCandidateRef.current = null;
    }
  }, [myLocation, visibleVehicles, vehicles, activeRide, routeById, tick, profile?.uid]);

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

  useEffect(() => {
    if (!myLocation || !mapRef.current || hasCenteredOnUserLocation.current) return;
    mapRef.current.flyTo([myLocation.lat, myLocation.lng], 16, { duration: 0.8 });
    hasCenteredOnUserLocation.current = true;
  }, [myLocation]);

  useEffect(() => {
    if (!myLocation) return undefined;

    let cancelled = false;
    const loadWeather = async () => {
      setWeather((current) => ({ ...current, loading: true }));
      try {
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.set('latitude', myLocation.lat);
        url.searchParams.set('longitude', myLocation.lng);
        url.searchParams.set('current', 'precipitation');
        url.searchParams.set('timezone', 'auto');
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather request failed');
        const data = await response.json();
        if (!cancelled) setWeather({
          loading: false,
          precipitation: Number(data.current?.precipitation ?? 0),
        });
      } catch {
        if (!cancelled) setWeather({ loading: false, precipitation: null });
      }
    };

    loadWeather();
    const intervalId = window.setInterval(loadWeather, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [myLocation?.lat, myLocation?.lng]);

  const focusRoute = routeFilter === 'all' ? null : routeById[routeFilter] ?? null;

  const approaching = useMemo(() => {
    if (!selectedStop) return [];
    return visibleVehicles
      .map((v) => ({ vehicle: v, km: haversineKm(selectedStop.lat, selectedStop.lng, v.lat, v.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8)
      .map(({ vehicle, km }) => ({ vehicle, km, etaMin: etaMinutes(km, vehicle.speed) }));
  }, [visibleVehicles, selectedStop]);

  const routeTarget = approaching[0]?.vehicle;

  useEffect(() => {
    if (!myLocation || !routeTarget) return undefined;

    let cancelled = false;
    const loadRouteEta = async () => {
      setRouteEtaLoading(true);
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${routeTarget.lng},${routeTarget.lat};${myLocation.lng},${myLocation.lat}?overview=false`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Route request failed');
        const data = await response.json();
        const seconds = Number(data.routes?.[0]?.duration);
        if (!cancelled) setRouteEtaMinutes(Number.isFinite(seconds) ? Math.round(seconds / 60) : null);
      } catch {
        if (!cancelled) setRouteEtaMinutes(null);
      } finally {
        if (!cancelled) setRouteEtaLoading(false);
      }
    };

    loadRouteEta();
    const intervalId = window.setInterval(loadRouteEta, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [myLocation?.lat, myLocation?.lng, routeTarget?.lat, routeTarget?.lng]);

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
  const removeSaved = (id, plate) => {
    const next = savedTransports.filter((t) => t.id !== id);
    setSavedTransports(next);
    localStorage.setItem('lo_saved_transports', JSON.stringify(next));
    setToast(`${plate || 'Bus'} removed from saved rides`);
  };

  /* ---- Recent Rides: add via Ride button ---- */
  const addRecentRide = (vehicle) => {
    const rideAt = Date.now();
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const row = { ...vehicleToRow(vehicle, routeById, now()), id, ownerUid: profile?.uid, recordType: 'ride', recordId: id, time: now(), rideAt };
    const next = [row, ...recentRides].slice(0, 50);
    setRecentRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
    if (firebaseReady && profile?.uid) {
      saveAnalyticsRecord(profile.uid, 'ride', row)
        .catch((syncError) => setToast(`Ride saved locally, but cloud sync failed: ${syncError.message}`));
    }
    setToast(`Ride with ${vehicle.vehicleId} added`);
  };
  const removeRecent = (id, plate) => {
    const removedRide = recentRides.find((ride) => ride.id === id);
    const next = recentRides.filter((r) => r.id !== id);
    setRecentRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
    if (firebaseReady && removedRide?.ownerUid) {
      deleteAnalyticsRecord(removedRide)
        .catch((syncError) => setToast(`Ride removed locally, but cloud deletion failed: ${syncError.message}`));
    }
    setToast(`${plate || 'Ride'} removed from recent rides`);
  };

  const confirmBulkRideDelete = () => {
    if (bulkRideConfirm === 'saved') {
      const next = savedTransports.filter((item) => !selectedSaved.includes(item.id));
      setSavedTransports(next);
      localStorage.setItem('lo_saved_transports', JSON.stringify(next));
      setToast(`${selectedSaved.length} saved rides removed`);
      setSelectedSaved([]);
    } else {
      const removedRides = recentRides.filter((item) => selectedRecent.includes(item.id));
      const next = recentRides.filter((item) => !selectedRecent.includes(item.id));
      setRecentRides(next);
      localStorage.setItem('lo_recent_rides', JSON.stringify(next));
      if (firebaseReady) {
        removedRides.filter((ride) => ride.ownerUid).forEach((ride) => {
          deleteAnalyticsRecord(ride)
            .catch((syncError) => setToast(`Rides removed locally, but cloud deletion failed: ${syncError.message}`));
        });
      }
      setToast(`${selectedRecent.length} recent rides removed`);
      setSelectedRecent([]);
    }
    setBulkRideConfirm('');
  };

  const saveRecentRide = (ride) => {
    if (savedTransports.some((saved) => saved.plate === ride.plate)) {
      const next = savedTransports.filter((saved) => saved.plate !== ride.plate);
      setSavedTransports(next);
      localStorage.setItem('lo_saved_transports', JSON.stringify(next));
      setToast(`${ride.plate} removed from saved rides`);
      return;
    }
    const row = {
      ...ride,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      firstTrip: ride.lastTrip || ride.firstTrip,
      lastTrip: ride.lastTrip || ride.firstTrip,
    };
    const next = [...savedTransports, row];
    setSavedTransports(next);
    localStorage.setItem('lo_saved_transports', JSON.stringify(next));
    setToast(`${ride.plate} added to saved rides`);
  };
  const isRideSaved = (ride) => savedTransports.some((saved) => saved.plate === ride.plate);

  /* ---- Analytics ---- */
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
  const handleFilterChange = (v) => { setRouteFilter(v); setSelectedStop(null); setRoutePickerOpen(false); };
  const recenter = () => { mapRef.current?.flyTo(myLocation ? [myLocation.lat, myLocation.lng] : ILOILO_CENTER, myLocation ? 16 : 14, { duration: 0.8 }); };
  const routePositions = focusRoute ? (focusRoute.loop ? loopPositions(focusRoute.stops) : focusRoute.stops.map((s) => [s.lat, s.lng])) : [];

  /* ======================== SIDEBAR PANEL ======================== */
  const panel = (
    <>
      <Section icon={UserRound} title="My Details" tint="primary">
        <ProfileScreen
          profile={profile}
          role={role || 'commuter'}
          onEdit={openDetailEditor}
          fallbackName="Commuter"
          showStatDivider={false}
          stats={[
            { label: 'Account', value: role || 'commuter' },
            { label: 'Number of rides', value: recentRides.length },
          ]}
        />
      </Section>

      {/* ---- Saved Transportations ---- */}
      <Section id="commuter-saved" icon={Bookmark} title="Saved Transportations" tint="success" flat>
        <SearchSortBar search={savedSearch} onSearchChange={setSavedSearch} sortField={savedSort.field} sortDir={savedSort.dir}
          onSortToggle={(field, dir) => setSavedSort({ field, dir })} fields={['plate', 'operatorName', 'driverName']} placeholder="Search saved…" />

        {filteredSaved.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>
            {savedTransports.length === 0 ? 'No saved PUVs yet.' : 'No matches.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: 'rgba(37,99,235,0.06)' }}>
              <label className="flex items-center gap-2 text-[9px] font-bold" style={{ color: 'var(--lo-text-secondary)' }}>
                <input type="checkbox" checked={filteredSaved.length > 0 && filteredSaved.every((item) => selectedSaved.includes(item.id))}
                  onChange={(event) => setSelectedSaved(event.target.checked ? filteredSaved.map((item) => item.id) : [])} /> Select all
              </label>
              {selectedSaved.length > 0 && <button type="button" onClick={() => setBulkRideConfirm('saved')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white"><Trash2 size={11} /> Delete {selectedSaved.length}</button>}
            </div>
            {/* Table header */}
            {filteredSaved.map((t) => (
              <ExpandableListCard
                key={t.id}
                leading={<input type="checkbox" checked={selectedSaved.includes(t.id)}
                  onChange={(event) => setSelectedSaved((current) => event.target.checked ? [...current, t.id] : current.filter((id) => id !== t.id))}
                  aria-label={`Select saved ride ${t.plate}`} />}
                summary={
                  <>
                    <p className="text-[10px] font-semibold text-slate-500">
                      {Number.isNaN(new Date(t.firstTrip || t.lastTrip || '').getTime())
                        ? 'Date unavailable'
                        : new Date(t.firstTrip || t.lastTrip).toLocaleDateString()}
                    </p>
                    <p className="truncate text-xs font-bold text-slate-900">{t.plate}</p>
                  </>
                }
                details={
                  <dl className="space-y-1 text-[10px]">
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Operator</dt><dd className="truncate text-right text-slate-900">{t.operatorName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Driver</dt><dd className="truncate text-right text-slate-900">{t.driverName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">First trip</dt><dd className="text-right text-slate-900">{t.firstTrip}</dd></div>
                  </dl>
                }
                actions={[{ icon: Bookmark, label: 'Remove from saved', danger: true, onClick: () => removeSaved(t.id, t.plate) }]}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ---- Recent Rides ---- */}
      <Section id="commuter-rides" icon={Clock} title="Recent Rides" tint="primary" defaultOpen={false} flat>
        <SearchSortBar search={recentSearch} onSearchChange={setRecentSearch} sortField={recentSort.field} sortDir={recentSort.dir}
          onSortToggle={(field, dir) => setRecentSort({ field, dir })} fields={['plate', 'operatorName', 'driverName']} placeholder="Search rides…" />

        {filteredRecent.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>
            {recentRides.length === 0 ? 'No rides yet. Tap a PUV and press Ride.' : 'No matches.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: 'rgba(37,99,235,0.06)' }}>
              <label className="flex items-center gap-2 text-[9px] font-bold" style={{ color: 'var(--lo-text-secondary)' }}>
                <input type="checkbox" checked={filteredRecent.length > 0 && filteredRecent.every((item) => selectedRecent.includes(item.id))}
                  onChange={(event) => setSelectedRecent(event.target.checked ? filteredRecent.map((item) => item.id) : [])} /> Select all
              </label>
              {selectedRecent.length > 0 && <button type="button" onClick={() => setBulkRideConfirm('recent')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white"><Trash2 size={11} /> Delete {selectedRecent.length}</button>}
            </div>
            {filteredRecent.map((r) => {
              const isSaved = isRideSaved(r);
              return (
              <ExpandableListCard
                key={r.id}
                leading={<input type="checkbox" checked={selectedRecent.includes(r.id)}
                  onChange={(event) => setSelectedRecent((current) => event.target.checked ? [...current, r.id] : current.filter((id) => id !== r.id))}
                  aria-label={`Select ride ${r.plate}`} />}
                summary={
                  <>
                    <p className="text-[10px] font-semibold text-slate-500">{formatRideDate(r)}</p>
                    <div className="flex items-center gap-1">
                      <p className="truncate text-xs font-bold text-slate-900">{r.plate}</p>
                      <button
                        type="button"
                        onClick={() => saveRecentRide(r)}
                        aria-label={isSaved ? `Remove ${r.plate} from saved rides` : `Save ${r.plate} to saved rides`}
                        aria-pressed={isSaved}
                        className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full ${isSaved ? 'text-blue-600' : 'text-slate-500'}`}
                      >
                        <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </>
                }
                details={
                  <dl className="space-y-1 text-[10px]">
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Operator</dt><dd className="truncate text-right text-slate-900">{r.operatorName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Driver</dt><dd className="truncate text-right text-slate-900">{r.driverName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Time</dt><dd className="text-right text-slate-900">{r.lastTrip}</dd></div>
                  </dl>
                }
                actions={[
                  { icon: Trash2, label: 'Delete ride', danger: true, onClick: () => removeRecent(r.id, r.plate) },
                ]}
              />
              );
            })}
          </div>
        )}
      </Section>

      <Section icon={Star} title="Analytics" tint="primary" defaultOpen={false}>
        {stats ? (
          <div className="space-y-3">
            <InfoRow label="Total rides" value={stats.total} />
            <InfoRow label="Operators" value={stats.routes} />
            <InfoRow label="Unique plates" value={stats.vehicles} />
            <RideCharts rides={recentRides} />
          </div>
        ) : (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>Ride a PUV to see stats.</p>
        )}
      </Section>

      {/* ---- Announcements ---- */}
      <Section icon={Megaphone} title="Announcements" tint="success" defaultOpen={false} flat>
        {announcements.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>No announcements yet.</p>
        ) : (
          <div className="space-y-1.5">
            {announcements.map((a) => (
            <ExpandableListCard
              key={a.id}
              summary={<><p className="text-[10px] font-semibold text-slate-500">{a.createdAt}</p><p className="truncate text-xs font-bold text-slate-900">{a.title}</p></>}
              details={<><p className="text-[10px] leading-relaxed text-slate-700">{a.message}</p><p className="mt-1 text-[9px] text-slate-500">{a.driverName} · {a.plate}</p></>}
            />
            ))}
          </div>
        )}
      </Section>

      <Section icon={CloudRain} title="Weather & Analytics" tint="primary" defaultOpen={false}>
        <WeatherTab latitude={myLocation?.lat} longitude={myLocation?.lng} />
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
    <AppShell brand="Commuter" panel={panel} dockItems={dockItems} utilityProfile={utilityProfile} open={drawerOpen} onOpenDrawer={onOpenDrawer} onCloseDrawer={onCloseDrawer} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
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
          <AntiBunchingSpatialLayer vehicles={visibleVehicles} />
          {pokeTarget && (
            <Marker position={[pokeTarget.lat, pokeTarget.lng]} icon={pokeIcon(pokeStateOf(pokeTarget.vehicleId) !== 'idle')} zIndexOffset={900}
              eventHandlers={{ click: () => handlePoke(pokeTarget) }} />
          )}
        </MapContainer>

        <div className="pointer-events-none absolute left-2 top-2 z-[1000] lg:left-3 lg:top-3">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border px-3 shadow-xl backdrop-blur" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
            <span className="flex items-center gap-1.5">
             <Radio size={14} className="text-[#14B383]" aria-hidden="true" />
              <span className="text-[11px] font-bold" style={{ color: 'var(--lo-primary)' }}>{visibleVehicles.length} live</span>
            </span>
          </div>
        </div>

        <div className="pointer-events-none absolute left-2 right-2 top-[3.25rem] z-[1000] flex justify-center lg:left-3 lg:right-auto">
          <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xl">
            {weather.loading ? (
              <p className="text-xs font-semibold text-slate-500">Checking rain…</p>
            ) : weather.precipitation == null ? (
              <p className="text-xs font-semibold text-slate-500">Rain data unavailable</p>
            ) : weather.precipitation > 2 ? (
              <>
                <p className="lo-rain-alert animate-pulse text-xs font-bold text-red-500">High passenger demand: Rain detected.</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{weather.precipitation.toFixed(1)} mm precipitation</p>
              </>
            ) : (
              <p className="text-xs font-semibold text-slate-500">{weather.precipitation.toFixed(1)} mm precipitation · No rain alert</p>
            )}
          </div>
        </div>

        {routePickerOpen && (
          <section aria-label="Select route" className="lo-route-picker absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[1100] mx-auto max-h-[min(60vh,24rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <h2 className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Select route</h2>
            <div role="listbox" aria-label="Available routes" className="space-y-1">
              {[{ id: 'all', name: 'All routes' }, ...routes.map((route) => ({ id: route.id, name: route.name }))].map((route) => (
                <button key={route.id} type="button" role="option" aria-selected={routeFilter === route.id} onClick={() => handleFilterChange(route.id)}
                  className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold  ${routeFilter === route.id ? 'bg-blue-600 text-white' : 'text-slate-900 '}`}>
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
              <button type="button" onClick={() => setSelectedStop(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl p-0" style={{ color: 'var(--lo-text-secondary)' }}>
                <X size={15} />
              </button>
            </div>
            {approaching.length === 0 ? (
              <p className="py-3 text-center text-xs" style={{ color: 'var(--lo-text-secondary)' }}>No live vehicles on this route.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {approaching.map(({ vehicle, km, etaMin: _etaMin }) => {
                  const meta = statusMeta(vehicle);
                  const state = pokeStateOf(vehicle.vehicleId);
                  return (
                    <ExpandableListCard
                      key={vehicle.vehicleId}
                      leading={<Bus size={15} className="mt-0.5 shrink-0 text-blue-600" />}
                      summary={<><p className="truncate text-xs font-bold text-slate-900">{vehicle.vehicleId}</p><p className="text-[10px] text-slate-500">{formatKm(km)} away · {meta.label}</p></>}
                      details={<dl className="grid grid-cols-2 gap-2 text-[10px]"><div><dt className="text-slate-500">Speed</dt><dd className="font-semibold text-slate-900">{(Number(vehicle.speed) || 0).toFixed(0)} km/h</dd></div><div><dt className="text-slate-500">ETA</dt><dd className="font-semibold text-slate-900">{vehicle === routeTarget ? (routeEtaLoading && routeEtaMinutes == null ? '…' : `${routeEtaMinutes ?? '—'} min`) : 'Unavailable'}</dd></div><div className="col-span-2"><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-900">{meta.label}</dd></div></dl>}
                      actions={[
                        { icon: Bus, label: 'Ride', onClick: () => addRecentRide(vehicle) },
                        { icon: Hand, label: state === 'sending' ? 'Sending poke…' : state === 'sent' ? 'Poked' : 'Poke', disabled: state !== 'idle', onClick: () => handlePoke(vehicle) },
                      ]}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {toast && (
          <div className="lo-toast pointer-events-none absolute left-1/2 top-14 z-[1100] -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-bold shadow-xl backdrop-blur"
            style={{ borderColor: 'var(--lo-primary)', background: 'var(--lo-panel)', color: 'var(--lo-primary)' }}>
            {toast}
          </div>
        )}

        <AnimatedPopup open={Boolean(bulkRideConfirm)}>
          {bulkRideConfirm && (
              <div role="dialog" aria-modal="true" aria-label="Confirm deletion" className="lo-dialog-card w-full max-w-sm p-4">
                <p className="text-sm font-bold text-slate-900">Confirm deletion</p>
                <p className="mt-1 text-[10px] text-slate-500">Delete the selected {bulkRideConfirm === 'saved' ? 'saved rides' : 'recent rides'}?</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setBulkRideConfirm('')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900">Cancel</button>
                  <button type="button" onClick={confirmBulkRideDelete} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white">Delete selected</button>
                </div>
              </div>
          )}
        </AnimatedPopup>

        {activeRide && (
          <div role="status" className="pointer-events-none absolute left-1/2 top-28 z-[1100] flex w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl border border-blue-600 bg-white px-4 py-3 shadow-xl"
            style={{ background: 'var(--lo-panel)' }}>
            <Bus size={20} className="shrink-0 text-blue-600" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-blue-600">Currently riding</p>
              <p className="truncate text-sm font-bold" style={{ color: 'var(--lo-text)' }}>{activeRide.plate}</p>
              <p className="truncate text-[10px]" style={{ color: 'var(--lo-text-secondary)' }}>{activeRide.operatorName}</p>
            </div>
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

      {/* ---- Edit My Details modal ---- */}
      <AnimatedPopup open={Boolean(editingDetails)}>
        {editingDetails && (
          <div role="dialog" aria-modal="true" aria-label="Edit details" className="lo-dialog-card max-h-[90dvh] w-full max-w-sm overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:mx-4 sm:pb-0">
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Details</h3>
              <button type="button" onClick={() => setEditingDetails(false)} aria-label="Close edit details dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 "><X size={20} /></button>
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
              <button type="button" onClick={saveDetails} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white  ">Save</button>
            </footer>
          </div>
        )}
      </AnimatedPopup>
    </AppShell>
  );
}
