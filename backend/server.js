'use strict';

/**
 * Look Out! — Real-Time PUV Transit Tracker (Backend)
 * Express + Socket.IO server tailored for Iloilo City LPTRP routes.
 *
 * Responsibilities
 *  1. REST   : serve the static LPTRP route catalogue (GET /api/routes)
 *  2. WS-IN  : receive live GPS fixes from driver devices ("updateLocation")
 *  3. WS-OUT : fan every fix out to all connected commuter maps ("driverMoved")
 *  4. Hygiene: drop vehicles on disconnect / end-trip / stale silence
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { getRoutes } = require('./data/lptrp-routes');

const PORT = Number(process.env.PORT || 4000);
const STALE_AFTER_MS = 3 * 60 * 1000; // no fix for 3 min -> considered gone
const SWEEP_INTERVAL_MS = 45 * 1000;

/** In-memory live fleet store: { [vehicleId]: record } */
const activeDrivers = {};

/**
 * CORS configuration: "*" by default, or a comma-separated allow-list via the
 * CORS_ORIGIN env var, e.g.
 *   CORS_ORIGIN=https://look-out.pages.dev,http://localhost:5173
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const CORS_ORIGIN = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS;

/* ------------------------------- REST layer ------------------------------ */

const app = express();

// Running behind Render/Cloudflare proxies -> honour X-Forwarded-* headers.
app.set('trust proxy', 1);

// CORS must be registered before any route handler.
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

/**
 * Root health probe. Render (and most uptime monitors) verify deploys by
 * requesting GET / — without this route Express would answer 404.
 */
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Look Out! Backend is running',
    service: 'look-out-backend',
    endpoints: ['/', '/api/routes', '/api/drivers', '/api/health'],
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
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  pingInterval: 20000,
  pingTimeout: 25000,
});

function liveCount() {
  return Object.keys(activeDrivers).length;
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

  /**
   * Driver devices push GPS fixes here.
   * Expected payload: { vehicleId, routeId, lat, lng, speed, heading }
   */
  socket.on('updateLocation', (payload = {}) => {
    const vehicleId =
      typeof payload.vehicleId === 'string' ? payload.vehicleId.trim().toUpperCase() : '';
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);

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
      socketId: socket.id,
      updatedAt: Date.now(),
    };

    activeDrivers[record.vehicleId] = record;
    io.emit('driverMoved', record);
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
  console.log('--------------------------------------------------');
  console.log('  Look Out! realtime server is running');
  console.log(`  ROOT : http://localhost:${PORT}/  (health probe)`);
  console.log(`  REST : http://localhost:${PORT}/api/routes`);
  console.log(`  WS   : ws://localhost:${PORT}  (Socket.IO)`);
  console.log('--------------------------------------------------');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received - shutting down...`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
