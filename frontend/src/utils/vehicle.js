/**
 * Look Out! — vehicle presentation helpers.
 *
 * A jeepney is either FULL (red) or STILL VACANT (blue). Availability wins over
 * the route colour for the vehicle body, while the route colour keeps driving
 * the pulse ring + label so commuters can still tell routes apart.
 */

export const STATUS = {
  full: {
    id: 'full',
    label: 'Full',
    long: 'Full — no more seats',
    color: '#ef4444',
    soft: 'rgba(239,68,68,0.16)',
  },
  vacant: {
    id: 'vacant',
    label: 'Still Vacant',
    long: 'Still vacant — may pick up passengers',
    color: '#3b82f6',
    soft: 'rgba(59,130,246,0.16)',
  },
};

/** Normalise whatever the socket/Firestore gave us into 'full' | 'vacant'. */
export function statusOf(vehicle) {
  return vehicle?.full === true || vehicle?.status === 'full' ? 'full' : 'vacant';
}

export function statusMeta(vehicle) {
  return STATUS[statusOf(vehicle)];
}

/** Body colour used by the map marker. */
export function statusColor(vehicle) {
  return statusMeta(vehicle).color;
}
