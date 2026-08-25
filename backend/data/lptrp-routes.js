'use strict';

/**
 * Look Out! — static route catalogue.
 *
 * Representative Iloilo City LPTRP jeepney corridors with sample stop
 * coordinates (accurate enough for demos/defense; re-survey before field use).
 *
 * Fare model follows the standard traditional-jeepney matrix:
 *   ₱13.00 for the first 4 km, then +₱2.00 per succeeding km (km rounded up).
 */

function haversineKm(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

const FARE_STRUCTURE = {
  currency: 'PHP',
  baseFare: 13,
  baseDistanceKm: 4,
  additionalPerKm: 2,
  note: 'Regular fare: ₱13 first 4 km + ₱2 per succeeding km. Discounted (student/senior/PWD): 20% off.',
};

const ROUTES = [
  {
    id: 'ungka-itgsi-loop',
    name: 'Ungka - ITGSI Loop',
    locality: 'Pavia · Jaro · La Paz · City Proper',
    type: 'Traditional Jeepney',
    color: '#22d3ee',
    loop: true,
    stops: [
      { id: 'ungka-terminal', name: 'Ungka Transport Terminal', lat: 10.7302, lng: 122.5326 },
      { id: 'ungka-ii-junction', name: 'Ungka II Junction', lat: 10.7276, lng: 122.5408 },
      { id: 'diversion-qabeto', name: 'Diversion Rd. - Q. Abeto', lat: 10.7224, lng: 122.5487 },
      { id: 'sm-city', name: 'SM City Iloilo', lat: 10.7164, lng: 122.5538 },
      { id: 'iznart-city-proper', name: 'Iznart St. - City Proper', lat: 10.7021, lng: 122.5621 },
      { id: 'plaza-libertad', name: 'Plaza Libertad', lat: 10.6978, lng: 122.5648 },
      { id: 'bonifacio-port', name: 'Bonifacio Dr. - Port', lat: 10.7062, lng: 122.569 },
      { id: 'mabini-la-paz', name: 'Mabini St. - La Paz', lat: 10.7168, lng: 122.5657 },
      { id: 'itgsi-campus', name: 'ITGSI Campus - La Paz', lat: 10.7249, lng: 122.5653 },
      { id: 'jaro-e-lopez', name: 'Jaro - E. Lopez St.', lat: 10.7361, lng: 122.562 },
    ],
  },
  {
    id: 'tagbak-city-proper',
    name: 'Tagbak - City Proper',
    locality: 'Jaro · La Paz · City Proper',
    type: 'Traditional Jeepney',
    color: '#a78bfa',
    loop: false,
    stops: [
      { id: 'tagbak-terminal', name: 'Tagbak Terminal, Jaro', lat: 10.7553, lng: 122.5692 },
      { id: 'jaro-plaza', name: 'Jaro Plaza', lat: 10.7429, lng: 122.5647 },
      { id: 'seminario-jaro', name: 'Seminario St., Jaro', lat: 10.7362, lng: 122.5624 },
      { id: 'la-paz-plaza', name: 'La Paz Plaza', lat: 10.7243, lng: 122.5641 },
      { id: 'burgos-mabini', name: 'Burgos St. - Mabini', lat: 10.7148, lng: 122.5638 },
      { id: 'iznart-central-market', name: 'Iznart St. - Central Market', lat: 10.7052, lng: 122.5633 },
      { id: 'freedom-grandstand', name: 'City Proper - Freedom Grandstand', lat: 10.6995, lng: 122.5642 },
    ],
  },
  {
    id: 'mandurriao-jaro-plaza',
    name: 'Mandurriao - Jaro Plaza',
    locality: 'Mandurriao · La Paz · Jaro',
    type: 'Traditional Jeepney',
    color: '#fbbf24',
    loop: false,
    stops: [
      { id: 'mandurriao-plaza', name: 'Mandurriao Plaza', lat: 10.721, lng: 122.537 },
      { id: 'san-rafael', name: 'San Rafael, Mandurriao', lat: 10.7189, lng: 122.5452 },
      { id: 'sm-city-mandurriao', name: 'SM City Iloilo', lat: 10.7164, lng: 122.5538 },
      { id: 'megaworld-diversion', name: 'Megaworld - Diversion Rd.', lat: 10.7122, lng: 122.5566 },
      { id: 'qabeto-infante', name: 'Q. Abeto - Infante', lat: 10.7182, lng: 122.5596 },
      { id: 'la-paz-market', name: 'La Paz Public Market', lat: 10.7268, lng: 122.5629 },
      { id: 'jaro-plaza-end', name: 'Jaro Plaza', lat: 10.7429, lng: 122.5647 },
    ],
  },
  {
    id: 'villa-beach-city-proper',
    name: 'Villa Beach - City Proper',
    locality: 'Arevalo · Molo · City Proper',
    type: 'Traditional Jeepney',
    color: '#34d399',
    loop: false,
    stops: [
      { id: 'villa-beach', name: 'Villa Beach - Dakung Balayan', lat: 10.6624, lng: 122.5437 },
      { id: 'sto-nino-sur', name: 'Sto. Niño Sur, Arevalo', lat: 10.6823, lng: 122.547 },
      { id: 'arevalo-plaza', name: 'Arevalo Plaza', lat: 10.6976, lng: 122.5508 },
      { id: 'molo-plaza', name: 'Molo Plaza', lat: 10.7087, lng: 122.5546 },
      { id: 'san-juan-molo', name: 'San Juan, Molo', lat: 10.7103, lng: 122.5588 },
      { id: 'calle-real', name: 'Calle Real - Iznart', lat: 10.7018, lng: 122.5624 },
      { id: 'plaza-libertad-villa', name: 'City Proper - Plaza Libertad', lat: 10.6978, lng: 122.5648 },
    ],
  },
];

/** Compute the peso fare for a trip distance using the LTFRB-style matrix. */
function fareForDistance(km) {
  const extraKm = Math.max(0, Math.ceil(km - FARE_STRUCTURE.baseDistanceKm));
  const regular = FARE_STRUCTURE.baseFare + extraKm * FARE_STRUCTURE.additionalPerKm;
  return {
    km: Math.round(km * 100) / 100,
    regular,
    discounted: Math.round(regular * 0.8 * 100) / 100,
  };
}

/**
 * Fare matrix per route:
 *  - one entry for every consecutive stop pair (the typical passenger ride)
 *  - one end-to-end reference entry
 */
function buildFareMatrix(route) {
  const entries = [];
  for (let i = 0; i < route.stops.length - 1; i += 1) {
    const from = route.stops[i];
    const to = route.stops[i + 1];
    entries.push({
      from: from.name,
      to: to.name,
      ...fareForDistance(haversineKm(from.lat, from.lng, to.lat, to.lng)),
    });
  }
  const first = route.stops[0];
  const last = route.stops[route.stops.length - 1];
  entries.push({
    from: first.name,
    to: last.name,
    endToEnd: true,
    ...fareForDistance(haversineKm(first.lat, first.lng, last.lat, last.lng)),
  });
  return entries;
}

/** Routes enriched with stop sequence numbers + computed fare matrices. */
function getRoutes() {
  return ROUTES.map((route) => ({
    ...route,
    stops: route.stops.map((stop, index) => ({ ...stop, sequence: index + 1 })),
    fareStructure: FARE_STRUCTURE,
    fareMatrix: buildFareMatrix(route),
  }));
}

module.exports = { getRoutes, haversineKm };
