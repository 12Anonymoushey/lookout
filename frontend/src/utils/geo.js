/**
 * Look Out! — geospatial helpers.
 * Pure functions shared by the Commuter and Driver views.
 */

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates in kilometres (Haversine). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Initial bearing from point A to point B, degrees in [0, 360). */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** 16-point compass label for a heading in degrees. */
export function cardinal(deg) {
  if (!Number.isFinite(deg)) return '—';
  const dirs = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  return dirs[Math.round(((((deg % 360) + 360) % 360) / 22.5)) % 16];
}

/** ETA in minutes for a distance at a given speed; null when too slow to matter. */
export function etaMinutes(km, speedKmh) {
  if (!Number.isFinite(km) || !Number.isFinite(speedKmh) || speedKmh <= 1) return null;
  return (km / speedKmh) * 60;
}

export function formatEta(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '--';
  return `${Math.max(1, Math.round(minutes))} min`;
}

export function formatKm(km) {
  if (!Number.isFinite(km)) return '--';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Total polyline length in km for an array of [lat, lng] tuples. */
export function pathLengthKm(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += haversineKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }
  return total;
}

/**
 * Interpolate the position `distKm` along a polyline of [lat, lng] tuples.
 * Returns { lat, lng, bearing } — used by the GPS movement simulator.
 */
export function pointAtDistance(points, distKm) {
  if (!points.length) return null;

  if (points.length === 1 || distKm <= 0) {
    const next = points[1] ?? points[0];
    return {
      lat: points[0][0],
      lng: points[0][1],
      bearing: bearingDeg(points[0][0], points[0][1], next[0], next[1]),
    };
  }

  let travelled = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [aLat, aLng] = points[i];
    const [bLat, bLng] = points[i + 1];
    const segKm = haversineKm(aLat, aLng, bLat, bLng);
    if (travelled + segKm >= distKm && segKm > 0) {
      const t = (distKm - travelled) / segKm;
      return {
        lat: aLat + (bLat - aLat) * t,
        lng: aLng + (bLng - aLng) * t,
        bearing: bearingDeg(aLat, aLng, bLat, bLng),
      };
    }
    travelled += segKm;
  }

  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? last;
  return {
    lat: last[0],
    lng: last[1],
    bearing: bearingDeg(prev[0], prev[1], last[0], last[1]),
  };
}

/** Stop list -> Leaflet polyline positions, closing the loop when route.loop. */
export function loopPositions(stops) {
  const pts = stops.map((s) => [s.lat, s.lng]);
  if (pts.length > 2) pts.push(pts[0]);
  return pts;
}
