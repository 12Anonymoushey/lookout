# How this Web App Works

Project: Look Out! — Real-Time PUV Transit Tracker

This guide describes the application as it exists in the source code. File references are relative to the repository root; line numbers refer to the current source and can move as code changes.

## What the application does

Look Out! is a web app for public utility vehicle (PUV) tracking in Iloilo City. Commuters can see active vehicles on a map, inspect routes and stops, estimate arrival times, and send a poke to a driver. Drivers can broadcast their location, manage vehicle plates, review pokes, record trip details, and post announcements. Administrators can manage accounts and review app activity.

The app has three role views: commuter, driver, and admin. It can also run in a local demo session when Firebase is not configured. It is a web application, not an installed/offline PWA: maps and live data require a network connection.

## Main folders and entry points

- `frontend/` contains the React browser application.
- `backend/` contains the Express REST API and Socket.IO real-time server.
- `firestore.rules` contains the Firestore access rules to publish in Firebase.
- `smoke-test.cjs` starts the actual backend and tests its REST and Socket.IO behavior.
- `README.md` contains quick-start and deployment commands.
- `docs/HOW-THIS-WEB-APP-WORKS.md` is this full architecture, feature, and learning guide.

## How the app starts and chooses a view

1. `frontend/src/main.jsx:1-12` imports the Leaflet and app CSS, mounts React into `index.html`'s `root` element, enables `StrictMode`, and wraps the app in `AuthProvider`.
2. `frontend/src/context/AuthContext.jsx:59-329` watches Firebase sign-in and the user's Firestore profile. It exposes the active profile, role, permissions, and account actions through `useAuth()`.
3. `frontend/src/App.jsx:13-207` waits for authentication initialization. If there is no profile, it shows `AuthScreen`. Otherwise it loads routes, subscribes to the shared Socket.IO feed, and selects `CommuterView`, `DriverView`, or `AdminView` based on the resolved role.
4. `frontend/src/components/Navbar.jsx:6-114` shows connection status, account information, sign-out, and (for admins) role-view switching.
5. Each role view uses `frontend/src/components/AppShell.jsx:16-350` for the responsive panel, navigation drawer, floating navigation dock, and shared “Ask admin”, “Feedback”, and “About the app” actions.

The role guard in `App.jsx` corrects an unavailable view after the account role is known. Admins may switch views; commuter and driver accounts are restricted to their respective views by the client role logic and Firestore rules.

## Feature list and where each feature is implemented

### Sign-in, accounts, and profile

- Email/password sign-up and sign-in; Google sign-in; commuter/driver role choice; driver plate capture; password visibility; input validation; demo sign-in: `frontend/src/components/AuthScreen.jsx:36-220`.
- Firebase Auth, role assignment, profile creation/repair, phone/plate normalization, profile reads and writes, and auth error messages: `frontend/src/services/authService.js:36-364`.
- Firebase app/Auth/Firestore initialization and the configured-versus-demo decision: `frontend/src/services/firebase.js:32-73`.
- Shared session, live profile subscription, demo session in localStorage, role and permission flags, profile/plate edits, and sign-out: `frontend/src/context/AuthContext.jsx:28-329`.
- Profile card and edit display: `frontend/src/components/AppShell.jsx:403-476`; commuter/driver edit forms are in `CommuterView.jsx:840-886` and `DriverView.jsx:950-1008`.
- Firestore profile and poke access rules: `firestore.rules:1-64`.

### Commuter view

- Live vehicle map, route filter, route lines and stops, current-position marker, live vehicle count, map recentering, and vehicle freshness filtering: `frontend/src/components/CommuterView.jsx:160-220`, `515-718`.
- Browser geolocation and location accuracy/status: `CommuterView.jsx:296-309`.
- Click a route stop to see nearby active vehicles, distance, availability, and the closest vehicle's OSRM driving-time estimate: `CommuterView.jsx:346-382`, `760-814`.
- Click a vehicle marker to see route, occupancy status, speed, nearest stop, distance, speed-based ETA, last GPS fix, and a poke action: `frontend/src/components/VehicleMarker.jsx:11-110`.
- Route-specific spatial anti-bunching overlay: `frontend/src/components/AntiBunchingSpatialLayer.jsx:46-110`. It constructs a forward/rear buffer around each vehicle and colors it red when another vehicle on the same route is inside that buffer.
- Send a poke to a nearby vehicle; the commuter view records sender, position, and route: `CommuterView.jsx:384-417`. Poke transport and fallback behavior are in `frontend/src/services/pokeService.js:91-135`.
- Add a ride manually; save/remove favorite PUVs; search, sort, and bulk-delete saved vehicles/recent rides; local ride history and charts: `CommuterView.jsx:192-207`, `436-510`, `537-644`.
- Automatic ride start/end detection uses the commuter's location and vehicle proximity; it writes the active ride and recent ride records to browser localStorage: `CommuterView.jsx:224-295`. Thresholds are defined near the top of the file: vehicle freshness is 90 seconds, automatic ride-start radius is 80 m, and exit/disappearance confirmation is timed.
- View driver announcements: `CommuterView.jsx:645-659`; data operations are in `frontend/src/services/announcementService.js:7-58`.
- Live precipitation banner and weather/analytics panel: `CommuterView.jsx:316-344`, `670-674`, `729-742`; detailed widget: `frontend/src/components/WeatherTab.jsx:4-93`.
- Emergency-radio playback, profile, live-fleet counts, route selection and map navigation are provided through the same commuter panel and `AppShell`.

### Driver view

- Select route and vehicle plate, start/end a trip, show GPS status/accuracy, coordinate/speed/heading telemetry, and follow the driver's position on the map: `frontend/src/components/DriverView.jsx:173-490`, `610-654`, `867-929`.
- Manage multiple plates and choose the active plate; plate edits are disabled while a trip is live: `frontend/src/components/PlateManager.jsx:5-103` and `DriverView.jsx:605-608`.
- Send GPS fixes from `navigator.geolocation`; speed and heading are derived from browser coordinates when not provided: `DriverView.jsx:302-328`.
- Indoor/classroom GPS simulator advances a point along the selected route. Driver location updates are sent every three seconds (`TICK_MS`): `DriverView.jsx:42`, `329-356`, `394`.
- Mark a vehicle “Full” or “Still Vacant”; the availability update is broadcast immediately: `DriverView.jsx:891-902`; backend handler: `backend/server.js:323-333`.
- Track the trip's distance, duration, average speed, route direction, destination completion, and GPS-fix count; automatically finish when the route destination is reached; save trip history locally: `DriverView.jsx:213-298`, `365-459`.
- Search, sort, edit revenue/income/gas/other expenses, review statistics/charts, and delete or bulk-delete trip history: `DriverView.jsx:528-586`, `656-745`.
- View incoming pokes for the active plate, including sender, message, time, and location. The panel hides a poke after the driver passes its recorded location: `frontend/src/components/DriverPokes.jsx:5-138`; used by `DriverView.jsx` around `856-865`.
- Create, edit, and delete the driver's own announcements; read all announcements: `DriverView.jsx:498-524`, `747-846`; storage functions: `frontend/src/services/announcementService.js:19-58`.
- Emergency radio, weather analytics, editable profile, route mini-map, and the floating trip/radio/poke controls are also included in the driver view.

### Admin view

- Overview of accounts and fleet activity, trip completion, daily activity, popular routes, and activity by vehicle: `frontend/src/components/AdminView.jsx:40-110`, `336-365`.
- Live account and recent-poke lists from Firestore; profile edits and account operations: `AdminView.jsx:113-285`, `518-704`; data services: `frontend/src/services/adminService.js:37-91`.
- Edit a user's profile/role/phone/plates, update another user's password through the backend, and delete another account. The signed-in administrator cannot delete their own account: `AdminView.jsx:209-285`, `660-704`; backend authorization and handlers: `backend/server.js:78-143`.
- Inspect, edit, delete, or bulk-delete ride/trip records: `AdminView.jsx:287-310`, `624-655`, `704-741`. Ride/trip records are currently browser-localStorage records, not a central database.
- Create, edit, remove, and bulk-delete announcements: `AdminView.jsx:312-333`, `366-429`. Announcements are currently stored in the browser's localStorage.
- Inspect and delete recent pokes; review admin logs; view and clear the local activity log: `AdminView.jsx:431-475`, `frontend/src/services/adminActivityService.js:1-22`.
- Read/mark-as-read/delete “Ask admin” and feedback messages: `AdminView.jsx:482-501`, `frontend/src/services/utilityInboxService.js:1-39`. This inbox is local to the browser, not a shared server inbox.
- Weather, analytics, emergency radio, account selection and bulk actions: `AdminView.jsx:476-513`, `518-764`.

### Shared interface and small components

- `frontend/src/components/AppShell.jsx:16-350` — desktop sidebar, mobile drawer, swipe/escape behavior, floating dock, accessible navigation, and utility dialogs. Its reusable `Section`, `InfoRow`, and `ProfileScreen` are at lines 351-476.
- `frontend/src/components/Navbar.jsx:6-114` — brand header, live/offline indicator, admin view switcher, account menu, and sign-out confirmation.
- `frontend/src/components/EmergencyRadio.jsx:5-100` — hold-to-talk microphone capture, transmission playback list, and Socket.IO audio broadcast.
- `frontend/src/components/WeatherTab.jsx:4-93` — geolocation-based precipitation, temperature, humidity, rain notice, and one-minute refresh.
- `frontend/src/components/DriverPokes.jsx:5-138` — driver poke count, feed, source label, and pass-by filtering.
- `frontend/src/components/PlateManager.jsx:5-103` — normalize, add, select, and remove plates.
- `frontend/src/components/VehicleMarker.jsx:11-110` — custom rotating SVG vehicle marker and popup information/actions.
- `frontend/src/components/AntiBunchingSpatialLayer.jsx:46-110` — Turf-based same-route spatial proximity visualization.
- `frontend/src/components/KebabMenu.jsx:7-115` — reusable action menu, search/sort control, and timed confirmation toast.
- `frontend/src/components/PulseDot.jsx:8-13` and `StatCard.jsx:2-13` — small status and statistic display components.
- `frontend/src/components/AuthScreen.jsx:207-220` — reusable authentication form field.
- `frontend/src/index.css` — global styles, tokens, map marker styles, and responsive interface styling.

## Frontend-to-backend data flow

1. `frontend/src/App.jsx` fetches `GET /api/routes` from the backend. It retries up to four times with a timeout and exposes a retry action if loading fails.
2. `frontend/src/services/socket.js:17-34` creates one shared Socket.IO client. It uses `VITE_BACKEND_URL` when set and otherwise uses `https://lookout-p8fw.onrender.com`.
3. A driver selects a route and active plate. The browser reports GPS fixes, or the simulator creates them, and `DriverView` emits `updateLocation` about every three seconds.
4. `backend/server.js:283-321` validates coordinates, updates the in-memory `activeDrivers` object, and broadcasts `driverMoved`.
5. `App.jsx:59-91` keeps the fleet in shared React state. A late-joining browser receives an `activeDrivers` snapshot. The commuter map renders current vehicles and ignores fixes older than 90 seconds.
6. Ending a trip, disconnecting, or going stale removes a vehicle and broadcasts `driverDisconnected`. The backend stale sweep runs every 45 seconds and removes vehicles without updates for three minutes (`backend/server.js:31-33`, `352-375`).
7. Pokes use Firestore when the user is authenticated and Firebase is ready. If that path fails or is unavailable, the client emits a Socket.IO `poke`; the backend counts/replays recent pokes in memory.

## Backend REST API

The server is `backend/server.js`. It uses Express, CORS, an HTTP server, and Socket.IO.

| Method and path | Purpose |
| --- | --- |
| `GET /` | Root health response used by deployment probes. |
| `GET /api/routes` | Route catalogue with stops, fare rules, and computed fare matrices. |
| `GET /api/drivers` | Current in-memory live-fleet snapshot. |
| `GET /api/pokes` | In-memory poke counts and recent poke records by plate. |
| `GET /api/health` | Health, uptime, and live vehicle count. |
| `PATCH /admin/users/:uid/password` | Admin-only Firebase Auth password update; requires a valid Firebase ID token. |
| `DELETE /admin/users/:uid` | Admin-only Firebase Auth and Firestore account deletion; requires a valid Firebase ID token. |

REST handlers and admin middleware: `backend/server.js:78-205`.

## Socket.IO event contract

Client to backend:

- `updateLocation` — `{ vehicleId, routeId, lat, lng, speed, heading, full }`.
- `setAvailability` — `{ vehicleId, full }`.
- `endTrip` — `{ vehicleId }`.
- `poke` — `{ toPlate, fromName, message, lat, lng, routeId }`.
- `emergency_radio` — recorded audio bytes, limited to 1 MB by the server.

Backend to clients:

- `activeDrivers` — initial snapshot of active fleet.
- `driverMoved` — the latest vehicle record, including `updatedAt` and availability.
- `driverDisconnected` — `{ vehicleId, reason }` after a trip ends, disconnects, or becomes stale.
- `pokeLog` — in-memory poke history snapshot on connection.
- `pokeReceived` — new poke with updated plate count.
- `emergency_radio` — audio broadcast to other connected clients.
- `invalidPayload` and `radioError` — input/size errors.

Handlers: `backend/server.js:269-365`. Shared fleet subscription and audio playback: `frontend/src/App.jsx:59-119`. The client configures a Firebase token for Socket.IO in `App.jsx` and `services/socket.js`, but the backend currently has no Socket.IO authentication middleware. Do not treat Socket.IO events as authenticated or production-secure.

## Route and fare data

`backend/data/lptrp-routes.js:24-105` contains four static sample routes: Ungka–ITGSI Loop, Tagbak–City Proper, Mandurriao–Jaro Plaza, and Villa Beach–City Proper. Stops have demo coordinates and a sequence number is added when returned by `getRoutes()`.

Fare calculations at `backend/data/lptrp-routes.js:107-154` use the configured traditional-jeepney fare assumption: PHP 13 for the first 4 km, plus PHP 2 for each succeeding whole kilometre. Discounted fare is calculated as 20% off the regular fare. These route coordinates are demonstration samples and should be surveyed and verified before real-world use. Fare estimates are straight-line stop-to-stop distances, not measured road-route fares.

## Data storage and important limits

- Firebase Authentication stores registered credentials; Firestore `users/{uid}` stores user profiles and driver plates.
- Firestore `pokes` and `pokeCounts` are used for authenticated poke history/counters; Socket.IO memory is the fallback.
- Active drivers and fallback poke logs are kept in backend memory. They disappear when the backend restarts and are not a durable trip database.
- Saved PUVs, commuter rides, active ride tracking, driver trips, announcements, admin logs, and the utility inbox use browser localStorage. They are browser/device-local and do not automatically synchronize between different users/devices.
- Map tiles, weather, and road-route estimates need internet access. Browser geolocation and microphone capture need browser permission; browser security generally requires localhost or HTTPS.
- The Render free service may sleep when idle. Its first request after sleep can take longer than usual.
- The app includes Firebase client configuration in the frontend. Firebase web API keys identify a project; they are not server credentials. Protect data with Firestore rules and Firebase Auth. Never put Firebase Admin credentials in frontend code.

## Technology stack and libraries

Frontend (`frontend/package.json`):

- React 19 and React DOM — UI components, state, and rendering.
- Vite 6 and `@vitejs/plugin-react` — development server and production bundling.
- Tailwind CSS 4 and `@tailwindcss/vite` — utility styling.
- Leaflet 1.9 and React Leaflet 5 — interactive maps, markers, route lines, tooltips, and polygons.
- Lucide React — interface icons.
- Firebase JS SDK 13 — Firebase Authentication and Cloud Firestore.
- Socket.IO Client 4 — real-time communication with the Node backend.
- Turf 7 (`@turf/bearing`, `@turf/destination`, `@turf/helpers`, `@turf/points-within-polygon`) — spatial buffering and same-route bunching checks.
- `oxlint` is included as a development dependency.

Backend (`backend/package.json`):

- Node.js 18 or newer — JavaScript runtime.
- Express 5 — REST routing and middleware.
- Socket.IO 4 — real-time event server.
- `cors` — cross-origin request policy.
- Firebase Admin SDK 14 — verify admin ID tokens and manage Firebase Auth/Firestore from the server.

Repository root:

- `concurrently` starts the frontend and backend development servers together.

## External services and browser APIs

- OpenStreetMap tile service: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. The map requires a network connection and should retain the required OSM attribution.
- OSRM public routing service: `https://router.project-osrm.org/route/v1/driving/...`. The commuter view uses it for a driving-duration estimate to the closest vehicle. Public-demo availability and routing accuracy are not guaranteed.
- Open-Meteo Forecast API: `https://api.open-meteo.com/v1/forecast`. It supplies current precipitation for the map warning and precipitation/temperature/humidity for weather panels.
- Firebase Authentication and Cloud Firestore: external identity and profile/poke data services. Configure a Firebase web app and publish `firestore.rules` to enable real accounts and database-backed features.
- Render-hosted backend: `https://lookout-p8fw.onrender.com` is the current default API and Socket.IO host. `VITE_BACKEND_URL` overrides it.
- Browser Geolocation API: obtains the commuter's and driver's coordinates.
- Browser `getUserMedia`, `MediaRecorder`, `Blob`, and `Audio`: capture and play emergency-radio messages.
- Browser localStorage: stores local demo session and client-only lists/history.

There is no Google Maps API integration. Leaflet renders OSM tiles. The frontend directly calls the public Open-Meteo and OSRM services and does not configure API keys for them.

## React concepts to learn (with this project as examples)

1. Components and JSX: reusable UI units, props, conditional rendering, lists, and event handlers. Start with `App.jsx`, then compare `CommuterView`, `DriverView`, and `VehicleMarker`.
2. Props and component composition: `App` passes route/fleet state into role views; `AppShell` composes a sidebar panel around a map stage.
3. `createContext`, `useContext`, and a custom hook: `AuthContext` centralizes account state so nested components can call `useAuth()` without passing profile data through every level.
4. `useState`: local interface state such as selected routes, modal visibility, live telemetry, and form drafts.
5. `useEffect`: subscriptions and browser lifecycle work, including Socket.IO listeners, Firebase snapshots, geolocation watches, timers, and cleanup.
6. `useCallback`: stable action functions passed to children or used by effects.
7. `useMemo`: derived data such as filtered vehicles, sorted lists, route lookups, and statistics.
8. `useRef`: values that must persist between renders without causing renders, such as a Leaflet map, latest GPS fix, recorder, and interval ID.
9. Controlled forms and validation: see `AuthScreen`, `PlateManager`, and profile/announcement edit forms.
10. Async UI and errors: loading flags, retry handling, status messages, and network error displays in `App.jsx`, `WeatherTab`, and the account screens.
11. Browser storage: localStorage persistence is convenient for a demo but is not shared or secure server-side persistence.
12. Separation of concerns: JSX components render UI; `services/` handles integrations and storage; `utils/` holds reusable calculations.

## Node.js and backend concepts to learn (with this project as examples)

1. Node.js modules and npm: package manifests, dependencies, scripts, CommonJS backend imports, and ES module frontend imports.
2. HTTP and REST: Express routes, methods, status codes, JSON request/response bodies, and resource naming (`backend/server.js:146-205`).
3. Middleware: CORS, JSON parsing, and the `requireAdmin` authentication middleware (`backend/server.js:63-109`).
4. Authentication and authorization: verifying Firebase ID tokens and checking roles. Authentication answers “who is signed in”; authorization answers “may this account perform this action?”
5. WebSockets and event-driven systems: Socket.IO connection lifecycle, client/server events, broadcasts, snapshots for late joiners, and disconnect cleanup.
6. In-memory state and persistence: the fleet/poke objects are simple runtime stores, not databases. Restarting the process loses them. Learn when to replace them with a durable database or cache.
7. Validation and API errors: numeric coordinate validation, range checks, HTTP errors, Socket.IO error events, and safe request-size limits.
8. CORS and deployment configuration: allowed origins, `PORT`, `CORS_ORIGIN`, and frontend `VITE_BACKEND_URL`.
9. Server lifecycle: health checks, stale-driver reaping, graceful shutdown, and listening behind a hosting proxy.
10. Firebase Admin SDK: server-side ID token verification and account management. Keep admin credentials only in server environment/hosting secrets.
11. Security basics: validate every event on the server; do not rely on hidden UI or client roles. Add Socket.IO authorization, per-user ownership checks, rate limits, payload limits, auditability, and persistent storage before production use.
12. Testing: `smoke-test.cjs` demonstrates real HTTP and Socket.IO integration checks. Run it after backend changes.

## Geospatial and data concepts to learn

- Haversine distance, initial bearing, ETA from speed, path length, interpolation along a polyline, and route loop handling: `frontend/src/utils/geo.js:10-110`.
- Vehicle occupancy normalization and display colors: `frontend/src/utils/vehicle.js:1-38`.
- Turf point-in-polygon analysis and GeoJSON coordinate order: `frontend/src/components/AntiBunchingSpatialLayer.jsx:1-110`.
- Static route catalogues, fare calculation, rounding, and data enrichment: `backend/data/lptrp-routes.js:13-154`.
- Understand the difference between straight-line distance and road-network travel time: the app uses Haversine for proximity and OSRM for the closest vehicle's road-time estimate.

## Run locally

Requirements: Node.js 18+ and npm.

1. From the repository root, install packages with `npm install` and `npm run install-all`.
2. Start both apps with `npm run dev`.
3. Open `http://localhost:5173`. The backend runs on port 4000.
4. For Firebase-backed auth, configure the Firebase web app in `frontend/src/services/firebase.js`, enable Email/Password and Google sign-in as needed, create Firestore, and publish `firestore.rules`.
5. Without valid Firebase configuration, use the demo sign-in. Demo accounts and data are browser-local.

Useful scripts:

- `npm run dev` — run backend and frontend together.
- `npm run server` — run only the backend.
- `npm run client` — run only the frontend.
- `npm run build` — build the frontend.
- `npm run preview` — preview the production build.
- `node smoke-test.cjs` — run backend REST/Socket.IO smoke tests.

## Deployment overview

- Backend: deploy the `backend/` directory as a Node web service (for example Render), with `npm install` as build and `npm start` as start command. Configure server-side Firebase Admin credentials if admin endpoints must work.
- Frontend: deploy `frontend/` as a Vite static site (for example Cloudflare Pages), with `npm run build`, output directory `dist`, and `VITE_BACKEND_URL` set to the backend URL.
- Configure production CORS origins through `CORS_ORIGIN`. Test Firebase authorized domains and Firestore rules for the deployed domain.
- After changing frontend environment variables, rebuild/redeploy because Vite embeds `VITE_` variables at build time.

## Known limitations before real-world use

- Route stops are representative/demo coordinates and need field verification.
- Backend live fleet and Socket.IO fallback poke data are in memory and disappear on restart.
- Trip records, announcements, utility inbox items, saved PUVs, and admin activity are localStorage data; they are not synchronized across devices or users.
- Socket.IO does not currently enforce Firebase authentication on the server. Admin REST endpoints do enforce Firebase ID tokens and the admin role.
- Public OSM, OSRM, and Open-Meteo services have independent availability, usage policies, and data accuracy. Add suitable caching, error handling, attribution, and service agreements before scaling.
- Rain is treated as an indicator of possible higher demand; it is not a measured passenger-demand forecast.
