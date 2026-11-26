'use strict';

/**
 * Look Out! — Real-Time PUV Transit Tracker (Backend)
 * Express + Socket.IO server tailored for Iloilo City LPTRP routes.
 *
 * Responsibilities
 *  1. REST   : serve the static LPTRP route catalogue (GET /api/routes)
 *  2. WS-IN  : receive live GPS fixes from driver devices ("updateLocation")
 *  3. WS-OUT : fan every fix out to all connected commuter maps ("driverMoved")
 *  4. POKES  : relay commuter "poke" taps to the driver consoles
 *              (the Firebase/Firestore path is preferred by the client; this is
 *              the offline/demo fallback + an always-on in-memory log)
 *  5. Hygiene: drop vehicles on disconnect / end-trip / stale silence
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
let firebaseAdmin = null;
try {
  firebaseAdmin = require('firebase-admin');
  if (!firebaseAdmin.apps.length) firebaseAdmin.initializeApp();
} catch (error) {
  console.warn('[Admin password] Firebase Admin unavailable:', error.message);
}

const { getRoutes } = require('./data/lptrp-routes');

const PORT = Number(process.env.PORT || 4000);
const STALE_AFTER_MS = 3 * 60 * 1000; // no fix for 3 min -> considered gone
const SWEEP_INTERVAL_MS = 45 * 1000;

/** In-memory live fleet store: { [vehicleId]: record } */
const activeDrivers = {};

/**
 * Poke log per plate: { [plate]: { count, recent: [poke, ...] } }
 * Replayed to every client on connect ("pokeLog") so a driver who refreshes
 * still sees the pokes she already received.
 */
const pokesByPlate = {};
const MAX_POKES_KEPT = 50;

/**
 * CORS configuration: "*" by default, or a comma-separated allow-list via the
 * CORS_ORIGIN env var, e.g.
 *   CORS_ORIGIN=https://look-out.pages.dev,http://localhost:5173
 */
const DEFAULT_PRODUCTION_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_ORIGINS : '*'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CORS_ORIGIN = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (CORS_ORIGIN === '*') return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
      || hostname.endsWith('.pages.dev')
      || hostname.endsWith('.cloudflarepages.com')
      || hostname.endsWith('.workers.dev');
  } catch {
    return false;
  }
}

/* ------------------------------- REST layer ------------------------------ */

const app = express();

// Running behind Render/Cloudflare proxies -> honour X-Forwarded-* headers.
app.set('trust proxy', 1);

// CORS must be registered before any route handler.
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed'));
  },
}));
app.use(express.json({ limit: '100kb' }));

async function requireAdmin(req, res, next) {
  if (!firebaseAdmin) {
    res.status(503).json({ error: 'Firebase Admin is not configured on the server.' });
    return;
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const decoded = await firebaseAdmin.auth().verifyIdToken(token);
    const profile = await firebaseAdmin.firestore().collection('users').doc(decoded.uid).get();
    if (decoded.admin !== true && profile.data()?.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    req.adminAuth = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

app.patch('/admin/users/:uid/password', requireAdmin, async (req, res) => {
  if (!firebaseAdmin) return res.status(503).json({ error: 'Password service is not configured on the server.' });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (req.params.uid === req.adminAuth.uid) return res.status(400).json({ error: 'Use account settings to change your own password.' });

  try {
    await firebaseAdmin.auth().updateUser(req.params.uid, { password });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(error.code === 'auth/user-not-found' ? 404 : 401).json({ error: error.message || 'Password update failed.' });
  }
});

app.delete('/admin/users/:uid', requireAdmin, async (req, res) => {
  if (req.params.uid === req.adminAuth.uid) {
    return res.status(400).json({ error: 'The signed-in administrator cannot delete their own account.' });
  }
  try {
    await firebaseAdmin.auth().deleteUser(req.params.uid);
    await firebaseAdmin.firestore().collection('users').doc(req.params.uid).delete();
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(error.code === 'auth/user-not-found' ? 404 : 500).json({
      error: error.code === 'auth/user-not-found'
        ? 'Account not found.'
        : error.message || 'Account deletion failed.',
    });
  }
});

/**
 * Root health probe. Render (and most uptime monitors) verify deploys by
 * requesting GET / — without this route Express would answer 404.
 */
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Look Out! Backend is running',
    service: 'look-out-backend',
    endpoints: ['/', '/api/routes', '/api/drivers', '/api/pokes', '/api/health'],
    timestamp: new Date().toISOString(),
  });
});

// Full LPTRP catalogue: stops with coordinates + computed fare matrices.
app.get('/api/routes', (_req, res) => {
  const routes = getRoutes();
  res.json({ success: true, count: routes.length, routes });
});

// Convenience endpoint: current fleet snapshot (useful for debugging/Postman).
app.get('/api/drivers', (_req, res) => {
  const drivers = Object.values(activeDrivers);
  res.json({ success: true, count: drivers.length, drivers });
});

// Poke log snapshot (handy for debugging + demo mode drivers).
app.get('/api/pokes', (_req, res) => {
  const plates = Object.entries(pokesByPlate).map(([plate, entry]) => ({
    plate,
    count: entry.count,
    recent: entry.recent,
  }));
  const total = plates.reduce((sum, entry) => sum + entry.count, 0);
  res.json({ success: true, total, plates, counts: countsByPlate() });
});

// Liveness probe for demos and uptime checks.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Look Out! Backend is running',
    service: 'look-out-backend',
    liveVehicles: Object.keys(activeDrivers).length,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// JSON 404 for anything else (never leak an HTML error page).
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    hint: 'Try GET / or GET /api/routes',
  });
});

/* ----------------------------- Socket.IO layer --------------------------- */

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed'));
    },
    methods: ['GET', 'POST'],
  },
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 2 * 1024 * 1024,
});

function liveCount() {
  return Object.keys(activeDrivers).length;
}

/** { plate: totalPokes } — sent to clients so counters are right on load. */
function countsByPlate() {
  return Object.fromEntries(
    Object.entries(pokesByPlate).map(([plate, entry]) => [plate, entry.count]),
  );
}

/**
 * Record one commuter poke against a plate.
 * @returns {{ plate: string, count: number, poke: object }|null}
 */
function recordPoke(payload = {}) {
  const plate = String(payload.toPlate ?? '').trim().toUpperCase();
  if (!plate) return null;

  const asCoord = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

  const poke = {
    toPlate: plate,
    fromName:
      typeof payload.fromName === 'string' && payload.fromName.trim()
        ? payload.fromName.trim().slice(0, 40)
        : 'A commuter',
    message:
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim().slice(0, 120)
        : 'Poke! 👋',
    lat: asCoord(payload.lat),
    lng: asCoord(payload.lng),
    routeId: payload.routeId ?? null,
    createdAt: Date.now(),
  };

  const entry = pokesByPlate[plate] ?? { count: 0, recent: [] };
  entry.count += 1;
  entry.recent = [poke, ...entry.recent].slice(0, MAX_POKES_KEPT);
  pokesByPlate[plate] = entry;

  return { plate, count: entry.count, poke };
}

function removeVehicle(vehicleId, reason) {
  if (!activeDrivers[vehicleId]) return false;
  delete activeDrivers[vehicleId];
  io.emit('driverDisconnected', { vehicleId, reason });
  console.log(`[-] Vehicle ${vehicleId} removed (${reason}) · live vehicles: ${liveCount()}`);
  return true;
}

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id} · sockets online: ${io.engine.clientsCount}`);

  // Late joiners immediately receive a snapshot of the current fleet.
  socket.emit('activeDrivers', Object.values(activeDrivers));

  // …and the poke log, so a driver console that just reloaded still shows
  // every poke received while she was on air.
  socket.emit('pokeLog', pokesByPlate);

  /**
   * Driver devices push GPS fixes here.
   * Expected payload: { vehicleId, routeId, lat, lng, speed, heading }
   */
  socket.on('updateLocation', (payload = {}) => {
    const vehicleId =
      typeof payload.vehicleId === 'string' ? payload.vehicleId.trim().toUpperCase() : '';
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      socket.emit('invalidPayload', { event: 'updateLocation', reason: 'Coordinates are out of range' });
      return;
    }

    if (!vehicleId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      socket.emit('invalidPayload', {
        event: 'updateLocation',
        reason: 'vehicleId, lat and lng are required numbers',
      });
      return;
    }

    const record = {
      vehicleId,
      routeId: payload.routeId ?? null,
      lat,
      lng,
      speed: Number.isFinite(Number(payload.speed)) ? Number(payload.speed) : 0,
      heading: Number.isFinite(Number(payload.heading)) ? Number(payload.heading) : 0,
      // "Full" (red on the map) vs "still vacant" (blue). Defaults to vacant.
      full: payload.full === true,
      socketId: socket.id,
      updatedAt: Date.now(),
    };

    activeDrivers[record.vehicleId] = record;
    io.emit('driverMoved', record);
  });

  /**
   * Driver toggled Full / Still Vacant between GPS fixes — push the new state
   * out immediately instead of waiting for the next 3 s tick.
   */
  socket.on('setAvailability', (payload = {}) => {
    const vehicleId = String(payload.vehicleId ?? '').trim().toUpperCase();
    const record = vehicleId ? activeDrivers[vehicleId] : null;
    if (!record) return;
    record.full = payload.full === true;
    record.updatedAt = Date.now();
    io.emit('driverMoved', record);
  });

  /**
   * Commuter poked a jeepney. Relayed to everyone (drivers filter by plate) and
   * kept in the in-memory log so counters survive a page reload.
   */
  socket.on('poke', (payload = {}) => {
    const result = recordPoke(payload);
    if (!result) return;
    io.emit('pokeReceived', result);
    console.log(`[👋] Poke → ${result.plate} (total ${result.count}) from ${result.poke.fromName}`);
  });

  socket.on('emergency_radio', (audioBuffer) => {
    if (!audioBuffer || (audioBuffer.byteLength || audioBuffer.length || 0) > 1024 * 1024) {
      socket.emit('radioError', { message: 'Transmission is too large.' });
      return;
    }
    socket.broadcast.emit('emergency_radio', audioBuffer);
  });

  /** Driver pressed "End Trip" — remove instantly instead of waiting for disconnect. */
  socket.on('endTrip', (payload = {}) => {
    const vehicleId = String(payload.vehicleId ?? '').trim().toUpperCase();
    if (vehicleId) removeVehicle(vehicleId, 'trip ended by driver');
  });

  socket.on('disconnect', (reason) => {
    console.log(`[-] Client disconnected: ${socket.id} (${reason})`);
    for (const [vehicleId, record] of Object.entries(activeDrivers)) {
      if (record.socketId === socket.id) removeVehicle(vehicleId, 'driver disconnected');
    }
  });
});

/**
 * Reaper — browsers killed without a clean "disconnect" (laptop sleep, force
 * kill) would otherwise linger forever. Anything silent for 3 minutes is purged.
 */
setInterval(() => {
  const cutoff = Date.now() - STALE_AFTER_MS;
  for (const [vehicleId, record] of Object.entries(activeDrivers)) {
    if (record.updatedAt < cutoff) removeVehicle(vehicleId, 'stale (no GPS updates)');
  }
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(PORT, () => {
  // Render injects RENDER_EXTERNAL_URL (https://<app>.onrender.com); outside
  // Render we stay friendly and print the localhost address instead.
  const base =
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RENDER === 'true' ? 'https://<your-app>.onrender.com' : `http://localhost:${PORT}`);
  const ws = base.replace(/^http/, 'ws');
  console.log('--------------------------------------------------');
  console.log('  Look Out! realtime server is running');
  console.log(`  ROOT : ${base}/  (health probe)`);
  console.log(`  REST : ${base}/api/routes`);
  console.log(`  WS   : ${ws}  (Socket.IO)`);
  console.log('--------------------------------------------------');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received - shutting down...`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
