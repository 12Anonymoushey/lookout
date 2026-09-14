import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bus, Loader2, RefreshCw } from 'lucide-react';
import Navbar from './components/Navbar.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import CommuterView from './components/CommuterView.jsx';
import DriverView from './components/DriverView.jsx';
import AdminView from './components/AdminView.jsx';
import { BACKEND_URL, socket } from './services/socket.js';
import { useAuth } from './context/AuthContext.jsx';

export default function App() {
  const {
    ready,
    profile,
    role,
    isAdmin,
    canViewCommuter,
    canViewDriver,
    isDemo,
    firebaseMissing,
    profileError,
    signOut,
  } = useAuth();

  const [view, setView] = useState('commuter');
  const [connected, setConnected] = useState(socket.connected);
  const [routes, setRoutes] = useState([]);
  const [routesError, setRoutesError] = useState('');
  const [vehiclesById, setVehiclesById] = useState({});
  // Shell state: mobile drawer + desktop panel visibility.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  /* ---- Socket.IO lifecycle: single subscription point for the fleet ---- */
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    // Server emits this right after connect so late joiners see live vehicles.
    const onSnapshot = (list = []) =>
      setVehiclesById(Object.fromEntries(list.map((v) => [v.vehicleId, v])));

    const onMoved = (record) =>
      setVehiclesById((prev) => ({ ...prev, [record.vehicleId]: record }));

    const onGone = ({ vehicleId } = {}) =>
      setVehiclesById((prev) => {
        if (!(vehicleId in prev)) return prev;
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('activeDrivers', onSnapshot);
    socket.on('driverMoved', onMoved);
    socket.on('driverDisconnected', onGone);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('activeDrivers', onSnapshot);
      socket.off('driverMoved', onMoved);
      socket.off('driverDisconnected', onGone);
    };
  }, []);

  /* --------------- REST: backend health + route catalogue ----------------- */
  const loadRoutes = useCallback(async () => {
    setRoutesError('');

    // Step 1 — prove the backend is awake via GET /api/health (a real endpoint,
    // never a bare "/" guess). Render's free tier sleeps after ~15 min idle;
    // the first request can take up to a minute while the service boots.
    try {
      const healthRes = await fetch(`${BACKEND_URL}/api/health`);
      if (!healthRes.ok) throw new Error(`health check responded HTTP ${healthRes.status}`);
      await healthRes.json();
    } catch (err) {
      setRoutesError(
        `Cannot reach backend at ${BACKEND_URL} (${err.message}). If the service was idle, Render may need up to a minute to wake up — press Retry.`,
      );
      return;
    }

    // Step 2 — backend is awake: load the LPTRP catalogue.
    try {
      const res = await fetch(`${BACKEND_URL}/api/routes`);
      if (!res.ok) throw new Error(`/api/routes responded HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success || !Array.isArray(data.routes)) {
        throw new Error(data.error || 'Malformed response from /api/routes');
      }
      setRoutes(data.routes);
    } catch (err) {
      setRoutesError(
        `Backend is online but /api/routes failed at ${BACKEND_URL} — ${err.message}`,
      );
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadRoutes();
  }, [loadRoutes, profile]);

  /* --------------- the signed-in role decides the landing tab --------------- */
  useEffect(() => {
    if (role === 'admin') {
      // Admins land on the console, then roam wherever they like.
      setView('admin');
    } else if (role === 'driver' || role === 'commuter') {
      setView(role);
    }
  }, [role]);

  /* --------------- nobody may open a view their role does not own ---------- */
  useEffect(() => {
    if (view === 'admin' && !isAdmin) setView(canViewDriver ? 'driver' : 'commuter');
    if (view === 'driver' && !canViewDriver) setView('commuter');
    if (view === 'commuter' && !canViewCommuter) setView('driver');
  }, [view, isAdmin, canViewCommuter, canViewDriver]);

  // Close the drawer whenever the view changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [view]);

  const switchView = useCallback((next) => setView(next), []);

  const vehicles = useMemo(() => Object.values(vehiclesById), [vehiclesById]);

  /* ------------------------------ auth gate ------------------------------- */
  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-slate-950 text-slate-300">
        <Loader2 size={26} className="animate-spin text-cyan-400" />
        <p className="text-sm font-semibold">Checking your session…</p>
      </div>
    );
  }

  if (!profile) return <AuthScreen />;

  const shellProps = {
    drawerOpen,
    onCloseDrawer: () => setDrawerOpen(false),
    collapsed: panelCollapsed,
    onToggleCollapse: () => setPanelCollapsed((v) => !v),
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100">
      <Navbar
        view={view}
        onViewChange={switchView}
        connected={connected}
        profile={profile}
        role={role}
        isAdmin={isAdmin}
        isDemo={isDemo}
        onSignOut={signOut}
        onOpenSidebar={() => setDrawerOpen(true)}
      />

      {firebaseMissing && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-200">
          <Bus size={13} className="shrink-0" />
          Demo session — accounts, plates and pokes are not saved. Paste your Firebase config into{' '}
          <code className="rounded bg-slate-900/70 px-1 font-mono">src/services/firebase.js</code>.
        </div>
      )}

      {profileError && (
        <div className="flex items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-[11px] text-rose-200">
          <AlertTriangle size={13} className="shrink-0" />
          {profileError}
        </div>
      )}

      {routesError && view !== 'admin' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            {routesError}
          </span>
          <button
            type="button"
            onClick={loadRoutes}
            className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-2.5 py-1 font-semibold transition hover:bg-amber-400/15"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      <main className="relative min-h-0 flex-1">
        {view === 'admin' ? (
          <AdminView vehicles={vehicles} {...shellProps} />
        ) : view === 'driver' ? (
          <DriverView routes={routes} connected={connected} {...shellProps} />
        ) : (
          <CommuterView
            routes={routes}
            vehicles={vehicles}
            hasFetchError={Boolean(routesError)}
            {...shellProps}
          />
        )}
      </main>
    </div>
  );
}
