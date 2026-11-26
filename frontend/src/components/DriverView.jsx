import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, TileLayer } from 'react-leaflet';
import {
  AlertTriangle,
  Banknote,
  Bus,
  ChevronDown,
  Clock,
  CloudRain,
  Crosshair,
  DollarSign,
  Fuel,
  Hand,
  Loader2,
  Megaphone,
  Pencil,
  Play,
  Satellite,
  Send,
  Square,
  Star,
  Trash2,
  TrendingUp,
  Radio,
  UserRound,
  X,
} from 'lucide-react';
import { socket } from '../services/socket.js';
import { bearingDeg, cardinal, haversineKm, pathLengthKm, pointAtDistance } from '../utils/geo.js';
import { useAuth } from '../context/AuthContext.jsx';
import AppShell, { AnimatedPopup, InfoRow, ProfileScreen, Section } from './AppShell.jsx';
import PlateManager from './PlateManager.jsx';
import DriverPokes from './DriverPokes.jsx';
import PulseDot from './PulseDot.jsx';
import EmergencyRadio from './EmergencyRadio.jsx';
import WeatherTab from './WeatherTab.jsx';
import VehicleMarker from './VehicleMarker.jsx';
import { ExpandableListCard, SearchSortBar, ConfirmToast } from './KebabMenu.jsx';
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, getDriverAnnouncements, getAllAnnouncements } from '../services/announcementService.js';

const ILOILO_CENTER = [10.7202, 122.5621];
const TICK_MS = 3000;

const fmtCoord = (n) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toFixed(6));
const fmtDuration = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const DESTINATION_RADIUS_KM = 0.15;

function nearestStop(route, lat, lng) {
  if (!route?.stops?.length || lat == null || lng == null) return { stop: null, distanceKm: Infinity, index: -1 };
  let nearest = { stop: route.stops[0], distanceKm: Infinity, index: 0 };
  route.stops.forEach((stop, index) => {
    const distanceKm = haversineKm(lat, lng, stop.lat, stop.lng);
    if (distanceKm < nearest.distanceKm) nearest = { stop, distanceKm, index };
  });
  return nearest;
}

function routeDirection(route, startIndex) {
  if (!route?.stops?.length) return 'Route not specified';
  const first = route.stops[0]?.name;
  const last = route.stops[route.stops.length - 1]?.name;
  if (route.loop) return `Round trip ${first || route.name}`;
  if (startIndex === 0) return `${first} to ${last}`;
  if (startIndex === route.stops.length - 1) return `${last} to ${first}`;
  return route.name;
}

function tripEpoch(trip) {
  if (trip.startedAtMs) return Number(trip.startedAtMs);
  const parsed = Date.parse(trip.startedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function tripSeconds(trip) {
  if (Number(trip.durationSeconds)) return Number(trip.durationSeconds);
  const parts = String(trip.duration || '').split(':').map(Number);
  return parts.length === 2 ? (parts[0] || 0) * 60 + (parts[1] || 0) : 0;
}

function DriverAnalytics({ trips }) {
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - i));
    const count = trips.filter((trip) => {
      const value = tripEpoch(trip);
      if (!value) return false;
      const tripDate = new Date(value);
      return tripDate.toDateString() === date.toDateString();
    }).length;
    return { label: date.toLocaleDateString([], { weekday: 'short' }), count };
  });

  const routeCounts = trips.reduce((counts, trip) => {
    const route = trip.routeDirection || trip.routeName || 'Unknown route';
    counts[route] = (counts[route] || 0) + 1;
    return counts;
  }, {});
  const routes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const durations = trips.map(tripSeconds);
  const speeds = trips.map((trip) => Number(trip.averageSpeedKmh) || 0);
  const completed = trips.filter((trip) => trip.destinationReached || trip.status === 'Finished route' || trip.status === 'Round trip completed').length;
  const today = byDay[6].count;
  const avgDuration = trips.length ? durations.reduce((sum, value) => sum + value, 0) / trips.length : 0;
  const avgSpeed = trips.length ? speeds.reduce((sum, value) => sum + value, 0) / trips.length : 0;
  const completionRate = trips.length ? Math.round(completed / trips.length * 100) : 0;
  const durationMax = Math.max(...durations, 1);
  const speedMax = Math.max(...speeds, 1);
  const dayMax = Math.max(...byDay.map((item) => item.count), 1);
  const routeMax = Math.max(...routes.map(([, count]) => count), 1);

  const BarChart = ({ data, label, valueKey, max, suffix = '', color = '#2563eb' }) => (
    <div>
      <p className="mb-2 text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>{label}</p>
      <div className="flex h-24 items-end gap-2 rounded-xl border px-2 pt-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
        {data.map((item, index) => (
          <div key={`${item.label || index}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[8px] font-bold" style={{ color: 'var(--lo-text)' }}>{item[valueKey]}{suffix}</span>
            <div className="w-full rounded-t-sm transition-[height] duration-300" style={{ height: `${Math.max(8, item[valueKey] / max * 68)}px`, background: color }} />
            <span className="truncate text-[8px]" style={{ color: 'var(--lo-text-secondary)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const routeData = routes.map(([label, count]) => ({ label: label.length > 16 ? `${label.slice(0, 16)}…` : label, count }));
  const speedData = trips.slice(-7).map((trip, index) => ({ label: String(index + 1), speed: Number(trip.averageSpeedKmh) || 0 }));
  const durationData = trips.slice(-7).map((trip, index) => ({ label: String(index + 1), duration: Math.round(tripSeconds(trip) / 60) }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "Today's trips", value: today },
          { label: 'Completion rate', value: `${completionRate}%` },
          { label: 'Average duration', value: fmtDuration(Math.round(avgDuration)) },
          { label: 'Average speed', value: `${avgSpeed.toFixed(1)} km/h` },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border px-2 py-2 text-center" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>{metric.value}</p>
            <p className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>{metric.label}</p>
          </div>
        ))}
      </div>
      <BarChart data={byDay} label="Trips in the last 7 days" valueKey="count" max={dayMax} />
      <BarChart data={durationData} label="Recent trip duration (minutes)" valueKey="duration" max={Math.max(...durationData.map((item) => item.duration), 1)} suffix="m" color="#0ea5e9" />
      <BarChart data={speedData} label="Recent average speed (km/h)" valueKey="speed" max={speedMax} suffix="" color="#10b981" />
      <BarChart data={routeData} label="Most ridden routes" valueKey="count" max={routeMax} color="#8b5cf6" />
      <div>
        <p className="mb-2 text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>Duration distribution</p>
        <div className="flex gap-1 rounded-xl border p-2" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)' }}>
          {[...Array(10)].map((_, index) => {
            const bandStart = durationMax / 10 * index;
            const bandEnd = durationMax / 10 * (index + 1);
            const count = durations.filter((value) => value >= bandStart && value < bandEnd).length;
            return (
              <div key={index} className="flex-1 text-center">
                <div className="mx-auto w-full rounded-t bg-blue-500" style={{ height: `${Math.max(3, count / Math.max(trips.length, 1) * 56)}px` }} />
                <span className="text-[7px]" style={{ color: 'var(--lo-text-secondary)' }}>{Math.round(bandStart / 60)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {routes[0] && <p className="rounded-xl px-3 py-2 text-[10px] leading-relaxed" style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--lo-text)' }}>
        <TrendingUp size={12} className="mr-1 inline" /> Your busiest route is <strong>{routes[0][0]}</strong>, with {routes[0][1]} recorded {routes[0][1] === 1 ? 'trip' : 'trips'}.
      </p>}
    </div>
  );
}

export default function DriverView({ routes, connected, drawerOpen, onOpenDrawer, onCloseDrawer, collapsed, onToggleCollapse, radioLogs = [], playingRadioId = '', utilityProfile }) {
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
  const [pokesOpen, setPokesOpen] = useState(false);

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
  const [deleteTripId, setDeleteTripId] = useState(null);
  const [selectedTrips, setSelectedTrips] = useState([]);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');

  // Announcements
  const [myAnnouncements, setMyAnnouncements] = useState([]);
  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [editingAnnounce, setEditingAnnounce] = useState(null);
  const [announceDraft, setAnnounceDraft] = useState({ title: '', message: '' });
  const [announcementTab, setAnnouncementTab] = useState('mine');
  const [deleteAnnouncementId, setDeleteAnnouncementId] = useState(null);

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
  const runStatsRef = useRef(null);
  const completeTripRef = useRef(null);

  useEffect(() => { routesRef.current = routes; }, [routes]);
  useEffect(() => { routeIdRef.current = routeId; }, [routeId]);
  useEffect(() => { fullRef.current = full; }, [full]);
  useEffect(() => { if (!routeId && routes.length > 0) setRouteId(routes[0].id); }, [routes, routeId]);
  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id); }, [toast]);

  const selectedRoute = useMemo(() => routes.find((r) => r.id === routeId) ?? null, [routes, routeId]);

  const pushFix = useCallback((fix) => {
    latestFixRef.current = fix;
    setTelemetry({ lat: fix.lat, lng: fix.lng, speed: fix.speed, heading: fix.heading });

    const run = runStatsRef.current;
    if (run && fix.lat != null && fix.lng != null) {
      if (run.lastFix && !simFlagRef.current) {
        const distanceKm = haversineKm(run.lastFix.lat, run.lastFix.lng, fix.lat, fix.lng);
        const elapsedHours = Math.max(0, (fix.timestamp - run.lastFix.timestamp) / 3_600_000);
        if (distanceKm < 2 && elapsedHours < 0.01) run.distanceKm += distanceKm;
      }
      run.lastFix = fix;
      if (Number.isFinite(fix.speed)) run.speedSamples.push(Math.max(0, fix.speed));

      const route = routesRef.current.find((item) => item.id === routeIdRef.current);
      if (route?.stops?.length) {
        const nearest = nearestStop(route, fix.lat, fix.lng);
        run.nearestStop = nearest;
        const start = route.stops[0];
        const end = route.stops[route.stops.length - 1];
        if (!run.startStop && nearest.stop) {
          run.startStop = nearest.stop;
          run.startIndex = nearest.index;
          run.destinationIndex = nearest.index === 0 ? route.stops.length - 1 : 0;
        }

        const destination = route.stops[run.destinationIndex];
        if (destination && nearest.stop?.id === destination.id && nearest.distanceKm <= DESTINATION_RADIUS_KM) {
          run.destinationReached = true;
        }

        const reachedStart = start && haversineKm(fix.lat, fix.lng, start.lat, start.lng) <= DESTINATION_RADIUS_KM;
        const reachedEnd = end && haversineKm(fix.lat, fix.lng, end.lat, end.lng) <= DESTINATION_RADIUS_KM;
        const loopRoute = route.loop || haversineKm(start.lat, start.lng, end.lat, end.lng) < 0.1;
        const fullLoopDistance = loopRoute ? pathLengthKm(route.loop ? [...route.stops.map((stop) => [stop.lat, stop.lng]), [start.lat, start.lng]] : route.stops.map((stop) => [stop.lat, stop.lng])) : 0;
        const completedRoundTrip = route.loop && run.distanceKm >= fullLoopDistance * 0.85 && reachedStart && run.startStop?.id !== start.id
          ? false
          : route.loop && run.distanceKm >= fullLoopDistance * 0.85 && reachedStart;

        if ((completedRoundTrip || (run.destinationReached && !route.loop && nearest.stop?.id === destination?.id)) && !run.autoCompleted) {
          run.autoCompleted = true;
          window.setTimeout(() => completeTripRef.current?.('auto'), 300);
        } else if (!route.loop && reachedStart && !reachedEnd && run.destinationReached) {
          run.returnedToStart = true;
          if (!run.autoCompleted) {
            run.autoCompleted = true;
            window.setTimeout(() => completeTripRef.current?.('auto'), 300);
          }
        }
      }
    }
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
      const routeLengthKm = pathLengthKm(points);
      if (routeLengthKm <= 0) return;
      const incrementKm = speedKmh * (TICK_MS / 3_600_000);
      const previousTravelledKm = state.travelledKm;
      const nextTravelledKm = previousTravelledKm + incrementKm;
      state.travelledKm = nextTravelledKm % routeLengthKm;
      if (runStatsRef.current) {
        runStatsRef.current.distanceKm += nextTravelledKm >= routeLengthKm
          ? routeLengthKm - previousTravelledKm + (nextTravelledKm % routeLengthKm)
          : incrementKm;
      }
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
    runStatsRef.current = {
      startedAtMs: Date.now(),
      lastFix: null,
      distanceKm: 0,
      speedSamples: [],
      startStop: null,
      startIndex: -1,
      destinationIndex: -1,
      destinationReached: false,
      returnedToStart: false,
      nearestStop: null,
      autoCompleted: false,
    };
    setIsLive(true);
    setStartedAt(Date.now());
    setElapsed(0);
    setSentCount(0);
    if (!simFlagRef.current) startGeoWatch();
    runTick();
    tickRef.current = setInterval(runTick, TICK_MS);
    setToast('Trip started');
  };

  const finalizeTrip = useCallback((completionType = 'manual') => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    stopGeoWatch();
    const vid = metaRef.current?.vehicleId;
    if (vid) socket.emit('endTrip', { vehicleId: vid });

    if (startedAt) {
      const endedAtMs = Date.now();
      const run = runStatsRef.current || {};
      const route = routesRef.current.find((item) => item.id === routeIdRef.current);
      const durationSeconds = Math.max(0, Math.floor((endedAtMs - startedAt) / 1000));
      const averageSpeed = durationSeconds > 0 ? ((run.distanceKm || 0) / durationSeconds) * 3600 : 0;
      const destinationReached = Boolean(run.destinationReached || (route?.loop && completionType === 'auto'));
      const nearestStop = run.nearestStop?.stop || null;
      const nearestStopDistanceKm = run.nearestStop?.distanceKm ?? Infinity;
      const stoppedAt = destinationReached ? 'Finished route' : nearestStop?.name || 'Location unavailable';
      const roundTrip = Boolean(route?.loop || run.returnedToStart);
      const direction = route?.loop
        ? `Round Trip ${route.stops?.[0]?.name || route.name}`
        : run.returnedToStart
          ? `${route?.stops?.[0]?.name} to ${route?.stops?.[route.stops.length - 1]?.name} then back`
          : run.startStop
            ? routeDirection(route, run.startIndex)
            : route.name;
      const trip = {
        id: Date.now().toString(),
        vehicleId: vid,
        routeId: routeIdRef.current,
        routeName: routesRef.current.find((r) => r.id === routeIdRef.current)?.name || '—',
        routeDirection: direction,
        roundTrip,
        startedAtMs: startedAt,
        endedAtMs,
        startedAt: new Date(startedAt).toLocaleString(),
        endedAt: new Date(endedAtMs).toLocaleString(),
        durationSeconds,
        duration: fmtDuration(durationSeconds),
        averageSpeedKmh: Number(averageSpeed.toFixed(1)),
        distanceKm: Number((run.distanceKm || 0).toFixed(2)),
        destinationReached,
        status: destinationReached ? 'Finished route' : 'Stopped early',
        stoppedAt,
        nearestStopName: nearestStop?.name || '',
        nearestStopDistanceKm: Number.isFinite(nearestStopDistanceKm) ? Number(nearestStopDistanceKm.toFixed(2)) : null,
        completionType,
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
    runStatsRef.current = null;
  }, [saveTrip, sentCount, startedAt, stopGeoWatch]);

  completeTripRef.current = finalizeTrip;
  const endTrip = () => finalizeTrip('manual');

  const toggleSim = () => {
    const next = !simFlagRef.current;
    simFlagRef.current = next;
    setSimEnabled(next);
    setError('');
    if (next) { stopGeoWatch(); simRef.current = { travelledKm: 0 }; }
    else if (isLiveRef.current) startGeoWatch();
    setToast(next ? 'GPS simulator ON' : 'GPS simulator OFF');
  };

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
    setDeleteAnnouncementId(null);
    setToast('Announcement deleted');
  };

  const gpsBadge = {
    idle: { icon: Satellite, spin: false, text: 'GPS idle', cls: 'text-slate-500' },
    acquiring: { icon: Loader2, spin: true, text: 'Acquiring…', cls: 'text-slate-900' },
    locked: { icon: Satellite, spin: false, text: accuracy ? `GPS ±${Math.round(accuracy)}m` : 'GPS locked', cls: 'text-slate-900' },
    denied: { icon: X, spin: false, text: 'GPS unavailable', cls: 'text-slate-900' },
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
    setDeleteTripId(null);
    setToast('Trip removed');
  };

  const confirmBulkDelete = () => {
    if (bulkDeleteConfirm === 'trips') {
      const next = trips.filter((trip) => !selectedTrips.includes(trip.id));
      setTrips(next);
      localStorage.setItem('lo_driver_trips', JSON.stringify(next));
      setToast(`${selectedTrips.length} trips removed`);
      setSelectedTrips([]);
    } else {
      selectedAnnouncements.forEach(deleteAnnouncement);
      refreshAnnouncements();
      setToast(`${selectedAnnouncements.length} announcements deleted`);
      setSelectedAnnouncements([]);
    }
    setBulkDeleteConfirm('');
  };

  /* ---- Detail editor draft auto-sync ---- */
  useEffect(() => { if (editingDetails) setDetailDraft({ fullName: profile?.fullName || '', phone: profile?.phone || '' }); }, [editingDetails, profile]);

  /* ======================== SIDEBAR ======================== */
  const panel = (
    <>
      {/* Tab 1: My Details (editable) */}
      <Section icon={UserRound} title="My Details" tint="primary">
        <ProfileScreen
          profile={profile}
          role="driver"
          onEdit={openDetailEditor}
          fallbackName="Driver"
          stats={[
            { label: 'Account', value: 'Driver' },
            { label: 'Trip', value: isLive ? 'On air' : 'Offline' },
          ]}
        />
      </Section>

      <Section id="driver-vehicles" icon={Bus} title="My Vehicles" tint="primary" flat>
        <PlateManager plates={plates} activePlate={activePlate} onSelect={setActivePlate} onChange={setPlates} disabled={isLive} />
      </Section>

      {/* Tab 2: Start Ride */}
      <Section id="driver-start-ride" icon={Play} title="Start Ride" tint="primary">
        {!connected && <p className="rounded-xl border px-2.5 py-2 text-[10px]" style={{ borderColor: 'var(--lo-panel-border)', background: 'var(--lo-bg)', color: 'var(--lo-text)' }}>Backend not connected.</p>}
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>Route</span>
          <span className="relative block">
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={isLive || routes.length === 0}
              className="w-full appearance-none rounded-xl border px-3 py-2 pr-8 text-xs focus:border-blue-600 focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }}>
              {routes.length === 0 && <option value="">Loading routes…</option>}
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--lo-text-secondary)' }} />
          </span>
        </label>
        <button type="button" onClick={isLive ? endTrip : beginTrip}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold shadow-lg   ${isLive ? 'bg-red-500 text-slate-900' : 'bg-emerald-500 text-slate-900'}`}>
          {isLive ? <><Square size={14} /> End Trip</> : <><Play size={14} /> Start Trip</>}
        </button>
        <button type="button" onClick={toggleSim}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-semibold "
          style={{ borderColor: simEnabled ? 'var(--lo-primary)' : 'var(--lo-card-border)', background: simEnabled ? 'rgba(37,99,235,0.1)' : 'var(--lo-card)', color: 'var(--lo-text)' }}>
          <Satellite size={13} /> {simEnabled ? 'GPS Sim ON' : 'GPS Simulator'}
        </button>
        {error && (
          <p className="flex items-start gap-1.5 rounded-xl border px-2.5 py-2 text-[10px]" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: 'var(--lo-text)' }}>
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
              <g.icon size={12} className={`mx-auto mb-1 ${g.cls || ''} ${g.spin ? 'animate-spin' : ''}`} style={!g.cls ? { color: 'var(--lo-primary)' } : undefined} />
              <p className={`font-mono text-xs font-bold ${g.cls || ''}`} style={!g.cls ? { color: 'var(--lo-text)' } : undefined}>{g.val}</p>
              <p className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>{g.lbl}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Tab 3: Trips */}
      <Section id="driver-trips" icon={Clock} title="Trips" tint="primary" defaultOpen={false} flat>
        <SearchSortBar search={tripSearch} onSearchChange={setTripSearch} sortField={tripSort.field} sortDir={tripSort.dir}
          onSortToggle={(field, dir) => setTripSort({ field, dir })} fields={['vehicleId', 'routeName', 'startedAt']} placeholder="Search trips…" />
        {filteredTrips.length === 0 ? (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>{trips.length === 0 ? 'No trips yet. Start a trip!' : 'No matches.'}</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: 'rgba(37,99,235,0.06)' }}>
              <label className="flex items-center gap-2 text-[9px] font-bold" style={{ color: 'var(--lo-text-secondary)' }}>
                <input type="checkbox" checked={filteredTrips.length > 0 && filteredTrips.every((trip) => selectedTrips.includes(trip.id))}
                  onChange={(event) => setSelectedTrips(event.target.checked ? filteredTrips.map((trip) => trip.id) : [])} /> Select all
              </label>
              {selectedTrips.length > 0 && <button type="button" onClick={() => setBulkDeleteConfirm('trips')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white"><Trash2 size={11} /> Delete {selectedTrips.length}</button>}
            </div>
            {filteredTrips.map((t) => {
              const date = tripEpoch(t);
              return (
                <ExpandableListCard
                  key={t.id}
                  leading={<input type="checkbox" checked={selectedTrips.includes(t.id)}
                    onChange={(event) => setSelectedTrips((current) => event.target.checked ? [...current, t.id] : current.filter((id) => id !== t.id))}
                    aria-label={`Select trip ${t.vehicleId}`} />}
                  summary={
                    <>
                      <p className="text-[10px] font-semibold text-slate-500">{date ? new Date(date).toLocaleDateString() : 'Unknown date'}</p>
                      <p className="truncate text-xs font-bold text-slate-900">{t.vehicleId} · {t.routeName}</p>
                    </>
                  }
                  details={
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                      <div><dt className="text-slate-500">Route</dt><dd className="font-semibold text-slate-900">{t.routeDirection || t.routeName}</dd></div>
                      <div><dt className="text-slate-500">Duration</dt><dd className="font-semibold text-slate-900">{t.duration || fmtDuration(t.durationSeconds || 0)}</dd></div>
                      <div><dt className="text-slate-500">Average speed</dt><dd className="font-semibold text-slate-900">{t.averageSpeedKmh || 0} km/h</dd></div>
                      <div><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-900">{t.status || (t.destinationReached ? 'Finished route' : 'Stopped early')}</dd></div>
                      <div><dt className="text-slate-500">Started</dt><dd className="font-semibold text-slate-900">{t.startedAt}</dd></div>
                      <div><dt className="text-slate-500">Ended</dt><dd className="font-semibold text-slate-900">{t.endedAt || '—'}</dd></div>
                      <div><dt className="text-slate-500">Revenue</dt><dd className="font-semibold text-slate-900">₱{t.revenue || 0}</dd></div>
                      <div><dt className="text-slate-500">Income</dt><dd className="font-semibold text-slate-900">₱{t.income || 0}</dd></div>
                      <div><dt className="text-slate-500">Gas</dt><dd className="font-semibold text-slate-900">₱{t.gas || 0}</dd></div>
                      <div><dt className="text-slate-500">Others</dt><dd className="font-semibold text-slate-900">₱{t.others || 0}</dd></div>
                      {!t.destinationReached && t.stoppedAt && <div className="col-span-2"><dt className="text-slate-500">Stopped at</dt><dd className="font-semibold text-slate-900">{t.stoppedAt}</dd></div>}
                    </dl>
                  }
                  footer={deleteTripId === t.id && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-red-300/60 bg-red-50 px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-red-700">Delete this trip?</p>
                      <div className="flex shrink-0 gap-1.5">
                        <button type="button" onClick={() => setDeleteTripId(null)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-700">Cancel</button>
                        <button type="button" onClick={() => removeTrip(t.id)} className="rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white">Delete</button>
                      </div>
                    </div>
                  )}
                  actions={[
                    { icon: Banknote, label: 'Edit finances', onClick: () => { setEditingTrip(t); setTripDraft({ revenue: String(t.revenue || ''), income: String(t.income || ''), gas: String(t.gas || ''), others: String(t.others || '') }); } },
                    { icon: Trash2, label: 'Delete', danger: true, onClick: () => setDeleteTripId(t.id) },
                  ]}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* Tab 4: Analytics */}
      <Section icon={Star} title="Analytics" tint="primary" defaultOpen={false}>
        {tripStats ? (
          <div className="space-y-1.5">
            <InfoRow label="Total trips" value={tripStats.total} />
            <InfoRow label="Total revenue" value={`₱${tripStats.totalRevenue}`} />
            <InfoRow label="Total income" value={`₱${tripStats.totalIncome}`} />
            <InfoRow label="Total gas" value={`₱${tripStats.totalGas}`} />
            <InfoRow label="Total others" value={`₱${tripStats.totalOthers}`} />
            <div className="mt-1 rounded-lg px-2 py-1.5" style={{ background: 'rgba(37,99,235,0.08)' }}>
              <InfoRow label="Net" value={<span className={`font-bold ${tripStats.net >= 0 ? 'text-slate-900' : 'text-slate-900'}`}>₱{tripStats.net}</span>} />
            </div>
            <div className="pt-2"><DriverAnalytics trips={trips} /></div>
          </div>
        ) : (
          <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>Complete trips to see stats.</p>
        )}
      </Section>

      {/* Announcements */}
      <Section icon={Megaphone} title="Announcements" tint="primary" defaultOpen={false} flat>
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--lo-text-secondary)' }}>Make announcement</p>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Title</span>
              <input value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} placeholder="e.g. Route diversion today"
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Message</span>
              <textarea value={announceMessage} onChange={(e) => setAnnounceMessage(e.target.value)} placeholder="Details for commuters…" rows={3}
                className="w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
            </label>
            <button type="button" onClick={submitAnnouncement} disabled={!announceTitle.trim() || !announceMessage.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white disabled:opacity-40">
              <Megaphone size={13} /> Post Announcement
            </button>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'var(--lo-card-border)' }}>
            <div className="relative mb-2 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <span
                className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-200"
                style={{ transform: announcementTab === 'mine' ? 'translateX(0)' : 'translateX(calc(100% + 4px))' }}
              />
              {[
                ['mine', 'My announcements'],
                ['all', 'All announcements'],
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setAnnouncementTab(id)}
                  className="relative z-10 rounded-lg py-1.5 text-[10px] font-bold transition-colors"
                  style={{ color: announcementTab === id ? 'var(--lo-primary)' : 'var(--lo-text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>

            {announcementTab === 'mine' && (
              myAnnouncements.length === 0 ? (
                <p className="lo-tab-content py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>No announcements yet.</p>
              ) : (
                <div className="space-y-1.5 lo-tab-content">
                  <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: 'rgba(37,99,235,0.06)' }}>
                    <label className="flex items-center gap-2 text-[9px] font-bold" style={{ color: 'var(--lo-text-secondary)' }}>
                      <input type="checkbox" checked={myAnnouncements.length > 0 && myAnnouncements.every((item) => selectedAnnouncements.includes(item.id))}
                        onChange={(event) => setSelectedAnnouncements(event.target.checked ? myAnnouncements.map((item) => item.id) : [])} /> Select all
                    </label>
                    {selectedAnnouncements.length > 0 && <button type="button" onClick={() => setBulkDeleteConfirm('announcements')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white"><Trash2 size={11} /> Delete {selectedAnnouncements.length}</button>}
                  </div>
                  {myAnnouncements.map((a) => (
                    <ExpandableListCard
                      key={a.id}
                      leading={<input type="checkbox" checked={selectedAnnouncements.includes(a.id)}
                        onChange={(event) => setSelectedAnnouncements((current) => event.target.checked ? [...current, a.id] : current.filter((id) => id !== a.id))}
                        aria-label={`Select announcement ${a.title}`} />}
                      summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{a.title}</p></>}
                      details={<><p className="text-[10px] leading-relaxed text-slate-700">{a.message}</p><p className="mt-1 text-[9px] text-slate-500">{a.plate} · {a.createdAt}</p></>}
                      footer={deleteAnnouncementId === a.id && (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5">
                          <span className="text-[9px] font-semibold text-red-700">Delete this announcement?</span>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setDeleteAnnouncementId(null)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-700">Cancel</button>
                            <button type="button" onClick={() => removeAnnouncement(a.id)} className="rounded-md bg-red-500 px-2 py-1 text-[9px] font-bold text-white">Delete</button>
                          </div>
                        </div>
                      )}
                      actions={[
                          { icon: Pencil, label: 'Edit', onClick: () => { setEditingAnnounce(a); setAnnounceDraft({ title: a.title, message: a.message }); } },
                          { icon: Trash2, label: 'Delete', danger: true, onClick: () => setDeleteAnnouncementId(a.id) },
                      ]}
                    />
                  ))}
                </div>
              )
            )}

            {announcementTab === 'all' && (
              allAnnouncements.length === 0 ? (
                <p className="py-2 text-center text-[11px]" style={{ color: 'var(--lo-text-secondary)' }}>No announcements.</p>
              ) : (
                <div className="space-y-1.5 lo-tab-content">
                  {allAnnouncements.map((a) => (
                    <ExpandableListCard
                      key={a.id}
                      summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{a.title}</p></>}
                      details={<><p className="text-[10px] leading-relaxed text-slate-700">{a.message}</p><p className="mt-1 text-[9px] text-slate-500">{a.driverName} · {a.plate} · {a.createdAt}</p></>}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </Section>
      <Section icon={Radio} title="Emergency Radio" tint="danger" defaultOpen={false} flat>
        <EmergencyRadio logs={radioLogs} playingId={playingRadioId} />
      </Section>
      <Section icon={CloudRain} title="Weather & Analytics" tint="primary" defaultOpen={false}>
        <WeatherTab latitude={telemetry.lat} longitude={telemetry.lng} />
      </Section>
    </>
  );

  const dockItems = [
    { id: 'radio', label: 'Hold emergency radio', icon: Radio, radio: true },
    { id: 'trip', label: 'Trip controls', icon: Play, target: 'driver-start-ride' },
    { id: 'pokes', label: 'Poke alerts', icon: Hand, disabled: !activePlate, returnToMap: true, onSelect: () => setPokesOpen(true) },
    { id: 'trips', label: 'Trip history', icon: Clock, target: 'driver-trips' },
  ];

  /* ======================== MAP STAGE ======================== */
  return (
    <AppShell brand="Driver" panel={panel} dockItems={dockItems} utilityProfile={utilityProfile} open={drawerOpen} onOpenDrawer={onOpenDrawer} onCloseDrawer={onCloseDrawer} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
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
            <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${isLive ? 'text-slate-900' : ''}`} style={!isLive ? { color: 'var(--lo-text-secondary)' } : undefined}>
              {isLive ? <PulseDot color="emerald" /> : <Satellite size={12} />}{isLive ? 'On air' : 'Offline'}
            </span>
            <span className="h-4 w-px" style={{ background: 'var(--lo-card-border)' }} />
            <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--lo-text)' }}>{metaRef.current?.vehicleId ?? activePlate ?? 'no plate'}</span>
            {isLive && <><span className="h-4 w-px" style={{ background: 'var(--lo-card-border)' }} /><span className="font-mono text-[10px]" style={{ color: 'var(--lo-text-secondary)' }}>{telemetry.speed.toFixed(0)} km/h · {sentCount} sent</span></>}
          </div>
        </div>

        <div className="absolute right-2 top-2 z-[1000] lg:right-3 lg:top-3">
          {isLive && (
            <button
              type="button"
              onClick={() => {
                const nextFull = !full;
                setFull(nextFull);
                fullRef.current = nextFull;
                if (metaRef.current?.vehicleId) {
                  socket.emit('setAvailability', { vehicleId: metaRef.current.vehicleId, full: nextFull });
                }
                setToast(nextFull ? 'Marked full' : 'Marked vacant');
              }}
              className="mr-2 h-10 rounded-full border px-3 text-[11px] font-bold backdrop-blur"
              style={{ borderColor: full ? '#ef4444' : '#10b981', background: 'var(--lo-panel)', color: full ? '#ef4444' : '#10b981' }}
            >
              {full ? 'Full' : 'Vacant'}
            </button>
          )}
          <button type="button" onClick={() => setFollow((f) => !f)}
            className="flex h-10 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur "
            style={{ borderColor: follow ? 'var(--lo-primary)' : 'var(--lo-card-border)', background: follow ? 'var(--lo-bg)' : 'var(--lo-panel)', color: follow ? 'var(--lo-primary)' : 'var(--lo-text)' }}>
            <Crosshair size={13} /> {follow ? 'Following' : 'Free pan'}
          </button>
        </div>

        {telemetry.lat == null && (
          <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center">
            <div className="rounded-2xl border px-5 py-4 text-center shadow-xl backdrop-blur" style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-panel)' }}>
              <Satellite size={22} className="mx-auto mb-1.5 animate-pulse" style={{ color: 'var(--lo-primary)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--lo-text)' }}>Waiting for GPS fix…</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--lo-text-secondary)' }}>Start a trip from the panel.</p>
            </div>
          </div>
        )}
      </section>

      <div className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-2 z-[1200] flex flex-col items-end gap-2.5 sm:bottom-7 sm:right-4 lg:bottom-8 lg:right-5">
        <DriverPokes
          plate={activePlate}
          active={isLive}
          position={{ lat: telemetry.lat, lng: telemetry.lng }}
          open={pokesOpen}
          onOpenChange={setPokesOpen}
          className="pointer-events-auto"
        />
      </div>

      <ConfirmToast message={toast} onClose={() => setToast('')} />
      <AnimatedPopup open={Boolean(bulkDeleteConfirm)}>
        {bulkDeleteConfirm && (
            <div role="dialog" aria-modal="true" aria-label="Confirm deletion" className="lo-dialog-card w-full max-w-sm p-4">
              <p className="text-sm font-bold text-slate-900">Confirm deletion</p>
              <p className="mt-1 text-[10px] text-slate-500">Delete the selected {bulkDeleteConfirm}?</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setBulkDeleteConfirm('')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900">Cancel</button>
                <button type="button" onClick={confirmBulkDelete} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white">Delete selected</button>
              </div>
            </div>
        )}
      </AnimatedPopup>

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

      {/* ---- Edit Trip Finances modal ---- */}
      <AnimatedPopup open={Boolean(editingTrip)}>
        {editingTrip && (
          <div role="dialog" aria-modal="true" aria-label="Edit trip finances" className="lo-dialog-card max-h-[90dvh] w-full max-w-sm overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:mx-4 sm:pb-0">
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Trip Finances</h3>
              <button type="button" onClick={() => setEditingTrip(null)} aria-label="Close trip finances dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 "><X size={20} /></button>
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
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                    style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
                </label>
              ))}
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <button type="button" onClick={() => setEditingTrip(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-900">Cancel</button>
              <button type="button" onClick={updateTripFinancials} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white  ">Save</button>
            </footer>
          </div>
        )}
      </AnimatedPopup>

      {/* ---- Edit Announcement modal ---- */}
      <AnimatedPopup open={Boolean(editingAnnounce)}>
        {editingAnnounce && (
          <div role="dialog" aria-modal="true" aria-label="Edit announcement" className="lo-dialog-card max-h-[90dvh] w-full max-w-sm overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:mx-4 sm:pb-0">
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--lo-text)' }}>Edit Announcement</h3>
              <button type="button" onClick={() => setEditingAnnounce(null)} aria-label="Close announcement dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 "><X size={20} /></button>
            </header>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Title</span>
                <input value={announceDraft.title} onChange={(e) => setAnnounceDraft((d) => ({ ...d, title: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--lo-text-secondary)' }}>Message</span>
                <textarea value={announceDraft.message} onChange={(e) => setAnnounceDraft((d) => ({ ...d, message: e.target.value }))} rows={3}
                  className="w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/25"
                  style={{ borderColor: 'var(--lo-card-border)', background: 'var(--lo-card)', color: 'var(--lo-text)' }} />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--lo-panel-border)' }}>
              <button type="button" onClick={() => setEditingAnnounce(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-900">Cancel</button>
              <button type="button" onClick={saveEditedAnnounce} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white  ">Save</button>
            </footer>
          </div>
        )}
      </AnimatedPopup>
    </AppShell>
  );
}
