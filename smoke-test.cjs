'use strict';

/**
 * Look Out! — end-to-end smoke test (temporary, safe to delete).
 * Boots the real Socket.IO server in-process and verifies:
 *   REST   : /api/health, /api/routes (4 LPTRP routes w/ fare matrices)
 *   SOCKET : updateLocation -> driverMoved fan-out
 *            activeDrivers snapshot for late joiners
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
