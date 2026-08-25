# 🚌 Look Out! — Real-Time PUV Transit Tracker

A 100% free-tier capstone project for 3rd-year IT students: track Iloilo City
**public utility vehicles (PUVs)** live on a map, tailored to **LPTRP routes**
(Ungka–ITGSI Loop, Tagbak–City Proper, Mandurriao–Jaro Plaza, Villa Beach–City Proper).

No API keys. No credit cards. OpenStreetMap + open-source only.

## Tech Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 19 (Vite) · Tailwind CSS v4 · Lucide icons · Leaflet.js     |
| Map tiles  | OpenStreetMap via react-leaflet (no Google Maps, no keys)          |
| Realtime   | Node.js + Express + Socket.IO (WebSocket)                          |
| Markers    | Custom SVG jeepney `L.DivIcon` (rotates with GPS heading)          |
| Geospatial | Haversine distance → ETA engine (`frontend/src/utils/geo.js`)     |

## Monorepo Layout

```
look_out!/
├── backend/
│   ├── server.js              # Express + Socket.IO realtime server (port 4000)
│   └── data/lptrp-routes.js   # Static LPTRP routes, stops & fare matrices
├── frontend/
│   ├── src/App.jsx            # Fleet state + socket subscriptions (single source)
│   ├── src/components/
│   │   ├── CommuterView.jsx   # Live map, route filter, stop ETA panel
│   │   ├── DriverView.jsx     # GPS broadcaster + classroom movement simulator
│   │   └── ...                # VehicleMarker, Navbar, StatCard, PulseDot
│   ├── src/services/socket.js # Shared Socket.IO client singleton
│   └── src/utils/geo.js       # Haversine, bearing, ETA, polyline helpers
└── package.json               # Root scripts (concurrently)
```

## Quick Start

Requirements: **Node.js ≥ 18** and npm.

```bash
# 1) Install everything (root concurrently + backend + frontend)
npm install
npm run install-all

# 2) Run BOTH servers with one command (from the repo root)
npm run dev
#   SERVER → http://localhost:4000  (Express REST + Socket.IO)
#   CLIENT → http://localhost:5173  (Vite dev server)

# Or run them in two terminals:
npm run server   # terminal 1 — backend
npm run client   # terminal 2 — frontend
```

Then open **two browser windows side by side**:

1. **Window A — Commuter tab:** the dark dashboard with the fullscreen OSM map.
2. **Window B — Driver tab:** type a body number (e.g. `JEEP-102`), pick a route,
   press **Start Trip**, or toggle **Simulate GPS Movement** for indoor demos.
   The jeep appears on Window A within ~3 seconds, moving along the route.

## How It Works

- `DriverView` captures fixes with `navigator.geolocation.watchPosition`
  (high accuracy) and emits `updateLocation` **every 3 s** over Socket.IO.
- The backend stores each vehicle in an in-memory `activeDrivers` map and
  broadcasts every fix as `driverMoved`; on disconnect / *End Trip* it removes
  the vehicle and broadcasts `driverDisconnected`. A reaper also purges
  vehicles silent for > 3 minutes.
- Late joiners get an `activeDrivers` snapshot on connect, so the map is never
  empty mid-trip.
- `CommuterView` renders custom rotating SVG jeepney markers; clicking a stop
  lists approaching vehicles sorted by **Haversine distance** with a
  speed-based **ETA**.

### Socket.IO contract

| Event                | Direction        | Payload                                        |
| -------------------- | ---------------- | ---------------------------------------------- |
| `updateLocation`     | driver → server  | `{ vehicleId, routeId, lat, lng, speed, heading }` |
| `driverMoved`        | server → all     | full vehicle record incl. `updatedAt`           |
| `driverDisconnected` | server → all     | `{ vehicleId, reason }`                         |
| `endTrip`            | driver → server  | `{ vehicleId }`                                 |
| `activeDrivers`      | server → joiner  | snapshot array                                  |

### REST endpoints

| Endpoint        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `GET /api/routes` | LPTRP route catalogue + stops + computed fare matrices (₱13 first 4 km, +₱2/km) |
| `GET /api/drivers`| Current live fleet snapshot                         |
| `GET /api/health` | Liveness probe                                      |

## Configuration

Copy the example env files if you need non-defaults (defaults work out of the box):

```bash
cp backend/.env.example backend/.env      # PORT=4000
cp frontend/.env.example frontend/.env    # VITE_BACKEND_URL=http://localhost:4000
```

## Production Build

```bash
npm run build      # bundles frontend into frontend/dist
npm run preview    # serve the production bundle locally
```

## Defense Tips & Troubleshooting

- **"Cannot reach backend" banner** → backend isn't running on port 4000;
  run `npm run server` first.
- **GPS denied in class** → use the built-in **Simulate GPS Movement** mode.
- **Port already in use** → change `PORT` in `backend/.env`, restart.
- **Map tiles blank offline** → OSM tiles need internet; data layer works offline.
- Stop coordinates are demo-grade samples of real corridors — re-survey before
  field deployment.
