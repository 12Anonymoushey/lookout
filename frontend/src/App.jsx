import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Navbar from './components/Navbar.jsx';
import CommuterView from './components/CommuterView.jsx';
import DriverView from './components/DriverView.jsx';
import { BACKEND_URL, socket } from './services/socket.js';

export default function App() {
  const [view, setView] = useState('commuter');
  const [connected, setConnected] = useState(socket.connected);
  const [routes, setRoutes] = useState([]);
  const [routesError, setRoutesError] = useState('');
  const [vehiclesById, setVehiclesById] = useState({});

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

  /* -------------------------- REST: route catalogue ----------------------- */
  const loadRoutes = useCallback(async () => {
    setRoutesError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/routes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown API error');
      setRoutes(data.routes);
    } catch (err) {
      setRoutesError(`Cannot reach backend at ${BACKEND_URL} — ${err.message}`);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const vehicles = useMemo(() => Object.values(vehiclesById), [vehiclesById]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100">
      <Navbar view={view} onViewChange={setView} connected={connected} />

      {routesError && (
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
        {view === 'commuter' ? (
          <CommuterView routes={routes} vehicles={vehicles} hasFetchError={Boolean(routesError)} />
        ) : (
          <DriverView routes={routes} connected={connected} />
        )}
      </main>
    </div>
  );
}
