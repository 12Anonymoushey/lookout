'use strict';

/**
 * Look Out! — end-to-end smoke test (temporary, safe to delete).
 * Boots the real Socket.IO server in-process and verifies:
 *   REST   : /api/health, /api/routes (4 LPTRP routes w/ fare matrices)
 *   SOCKET : updateLocation -> driverMoved fan-out
 *            activeDrivers snapshot for late joiners
 *            full/vacant flag + setAvailability broadcast
 *            poke relay + pokeLog replay
 *            endTrip       -> driverDisconnected cleanup
 */

process.env.PORT = 4399; // avoid clashing with anything on 4000

const http = require('http');
const path = require('path');

const ROOT = __dirname;
const FRONTEND_NM = path.join(ROOT, 'frontend');
const io = require(require.resolve('socket.io-client', { paths: [FRONTEND_NM] }));

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`);
  if (!ok) failures += 1;
};

const getJson = (url) =>
  new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Boot the actual server module.
  require(path.join(ROOT, 'backend', 'server.js'));
  await wait(1200);

  /* ------------------------------ REST checks ----------------------------- */
  const health = await getJson('http://localhost:4399/api/health');
  check('GET /api/health', health.status === 'ok');

  // Render-style deploy verification pings GET / — it must NOT be a 404.
  const rootProbe = await getJson('http://localhost:4399/');
  check(
    'GET / root health probe',
    rootProbe.status === 'ok' && /running/i.test(rootProbe.message ?? ''),
    rootProbe.message,
  );

  const routes = await getJson('http://localhost:4399/api/routes');
  check(
    'GET /api/routes returns 4 LPTRP routes',
    routes.success === true && Array.isArray(routes.routes) && routes.routes.length === 4,
    `count=${routes.count}`,
  );
  const tagbak = routes.routes.find((r) => r.id === 'tagbak-city-proper');
  check(
    'Tagbak route has stops + computed fare matrix',
    tagbak &&
      tagbak.stops.length >= 6 &&
      Array.isArray(tagbak.fareMatrix) &&
      tagbak.fareMatrix.every((f) => f.regular >= 13),
    `stops=${tagbak ? tagbak.stops.length : 0}, baseFare=${tagbak?.fareStructure.baseFare}`,
  );

  /* ----------------------------- Socket checks ---------------------------- */
  const movedPayloads = [];
  let gonePayload = null;

  const commuter = io('http://localhost:4399', { transports: ['websocket'] });
  const commuterReady = new Promise((resolve) =>
    commuter.on('connect', () => resolve(commuter.id)),
  );
  await commuterReady;
  commuter.on('driverMoved', (rec) => movedPayloads.push(rec));
  commuter.on('driverDisconnected', ({ vehicleId }) => (gonePayload = vehicleId));

  // Driver connects AFTER the commuter, emits a GPS fix every ~250 ms (x3).
  const driver = io('http://localhost:4399', { transports: ['websocket'] });
  await new Promise((resolve) => driver.on('connect', resolve));

  for (let i = 0; i < 3; i += 1) {
    driver.emit('updateLocation', {
      vehicleId: 'test-01',
      routeId: 'tagbak-city-proper',
      lat: 10.72 + i * 0.001,
      lng: 122.5621,
      speed: 24 + i,
      heading: 90 + i,
    });
    await wait(250);
  }

  check(
    'driverMoved broadcast received by commuter',
    movedPayloads.length >= 3,
    `received=${movedPayloads.length}`,
  );
  const last = movedPayloads[movedPayloads.length - 1];
  check(
    'vehicle id normalised + coordinates intact',
    !!last &&
      last.vehicleId === 'TEST-01' &&
      Math.abs(last.lat - 10.722) < 1e-9 &&
      last.routeId === 'tagbak-city-proper',
  );

  /* --------------------------- availability -------------------------- */
  driver.emit('updateLocation', {
    vehicleId: 'test-01',
    routeId: 'tagbak-city-proper',
    lat: 10.723,
    lng: 122.5621,
    speed: 20,
    heading: 91,
    full: true,
  });
  await wait(250);
  check(
    'full flag carried through driverMoved',
    movedPayloads[movedPayloads.length - 1]?.full === true,
  );

  const beforeToggle = movedPayloads.length;
  driver.emit('setAvailability', { vehicleId: 'test-01', full: false });
  await wait(250);
  const toggled = movedPayloads.slice(beforeToggle).pop();
  check(
    'setAvailability broadcasts "Still Vacant" immediately',
    !!toggled && toggled.vehicleId === 'TEST-01' && toggled.full === false,
  );

  /* ------------------------------- pokes ------------------------------ */
  const pokesSeen = [];
  driver.on('pokeReceived', (payload) => pokesSeen.push(payload));

  commuter.emit('poke', {
    toPlate: 'test-01',
    fromName: 'Smoke Commuter',
    message: 'Poke! 👋',
    lat: 10.72,
    lng: 122.5621,
    routeId: 'tagbak-city-proper',
  });
  await wait(300);
  check(
    'poke reaches the driver console with a running count',
    pokesSeen.length === 1 && pokesSeen[0].plate === 'TEST-01' && pokesSeen[0].count === 1,
    `count=${pokesSeen[0]?.count}`,
  );
  check(
    'poke keeps who sent it and what it says',
    pokesSeen[0]?.poke?.message === 'Poke! 👋' &&
      pokesSeen[0]?.poke?.fromName === 'Smoke Commuter',
  );

  const pokeApi = await getJson('http://localhost:4399/api/pokes');
  check(
    'GET /api/pokes reports the total',
    pokeApi.success === true && pokeApi.total === 1 && pokeApi.counts['TEST-01'] === 1,
    `total=${pokeApi.total}`,
  );

  // Late joiner must receive the fleet snapshot immediately.
  const lateJoinerSnapshot = await new Promise((resolve) => {
    const late = io('http://localhost:4399', { transports: ['websocket'] });
    late.on('activeDrivers', (list) => {
      resolve(list);
      late.disconnect();
    });
  });
  check(
    'late joiner receives activeDrivers snapshot',
    Array.isArray(lateJoinerSnapshot) && lateJoinerSnapshot.some((v) => v.vehicleId === 'TEST-01'),
  );

  // …and the poke log, so a refreshed driver console is never blank.
  const lateJoinerPokes = await new Promise((resolve) => {
    const late = io('http://localhost:4399', { transports: ['websocket'] });
    late.on('pokeLog', (log) => {
      resolve(log);
      late.disconnect();
    });
  });
  check(
    'late joiner receives the poke log replay',
    lateJoinerPokes?.['TEST-01']?.count === 1 && lateJoinerPokes['TEST-01'].recent.length === 1,
    `count=${lateJoinerPokes?.['TEST-01']?.count}`,
  );

  // End trip must purge the vehicle everywhere.
  driver.emit('endTrip', { vehicleId: 'test-01' });
  await wait(400);
  check('endTrip triggers driverDisconnected', gonePayload === 'TEST-01', `got=${gonePayload}`);

  const driversAfter = await getJson('http://localhost:4399/api/drivers');
  check('fleet store emptied after endTrip', driversAfter.count === 0);

  commuter.disconnect();
  driver.disconnect();
  await wait(200);

  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SMOKE TEST CRASHED:', err);
  process.exit(1);
});
