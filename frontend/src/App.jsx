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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSnapshot = (list = []) => setVehiclesById(Object.fromEntries(list.map((v) => [v.vehicleId, v])));
    const onMoved = (record) => setVehiclesById((prev) => ({ ...prev, [record.vehicleId]: record }));
    const onGone = ({ vehicleId } = {}) => setVehiclesById((prev) => {
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

  const loadRoutes = useCallback(async () => {
    setRoutesError('');
    try {
      const healthRes = await fetch(`${BACKEND_URL}/api/health`);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      await healthRes.json();
    } catch (err) {
      setRoutesError(`Cannot reach backend (${err.message}). Press Retry.`);
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/routes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success || !Array.isArray(data.routes)) throw new Error(data.error || 'Malformed response');
      setRoutes(data.routes);
    } catch (err) {
      setRoutesError(`Backend online but /api/routes failed — ${err.message}`);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadRoutes();
  }, [loadRoutes, profile]);

  useEffect(() => {
    if (role === 'admin') setView('admin');
    else if (role === 'driver' || role === 'commuter') setView(role);
  }, [role]);

  // Guard: only correct the view once a role is resolved. Without this,
  // the effect loops endlessly during the initial load when canView* are false.
  useEffect(() => {
    if (!role) return;
    if (view === 'admin' && !isAdmin) setView(canViewDriver ? 'driver' : 'commuter');
    else if (view === 'driver' && !canViewDriver) setView('commuter');
    else if (view === 'commuter' && !canViewCommuter) setView('driver');
  }, [role, view, isAdmin, canViewCommuter, canViewDriver]);

  useEffect(() => { setDrawerOpen(false); }, [view]);

  const switchView = useCallback((next) => setView(next), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const vehicles = useMemo(() => Object.values(vehiclesById), [vehiclesById]);

  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-slate-50 text-slate-900">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <p className="text-sm font-semibold">Loading…</p>
      </div>
    );
  }

  if (!profile) return <AuthScreen />;

  const shellProps = {
    drawerOpen,
    onOpenDrawer: openDrawer,
    onCloseDrawer: closeDrawer,
    collapsed: panelCollapsed,
    onToggleCollapse: () => setPanelCollapsed((v) => !v),
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900">
      <Navbar view={view} onViewChange={switchView} connected={connected} profile={profile} role={role} isAdmin={isAdmin} isDemo={isDemo} onSignOut={signOut} onOpenSidebar={openDrawer} />

      {firebaseMissing && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-900">
          <Bus size={13} className="shrink-0" /> Demo session — not saved.
        </div>
      )}

      {profileError && (
        <div className="flex items-center gap-2 border-b border-red-500 bg-red-500 px-4 py-1.5 text-[11px] text-slate-900">
          <AlertTriangle size={13} className="shrink-0" /> {profileError}
        </div>
      )}

      {routesError && view !== 'admin' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-500 bg-red-500 px-4 py-2 text-xs text-slate-900">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" /> {routesError}
          </span>
          <button type="button" onClick={loadRoutes} className="flex min-h-11 items-center gap-2 rounded-xl border border-blue-600/40 bg-white px-3 text-sm font-semibold text-blue-600 transition hover:bg-slate-50">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}
      <main className="relative min-h-0 flex-1">
        {view === 'admin' ? (
          <AdminView vehicles={vehicles} onViewChange={switchView} {...shellProps} />
        ) : view === 'driver' ? (
          <DriverView routes={routes} connected={connected} {...shellProps} />
        ) : (
          <CommuterView routes={routes} vehicles={vehicles} hasFetchError={Boolean(routesError)} {...shellProps} />
        )}
      </main>
    </div>
  );
}
