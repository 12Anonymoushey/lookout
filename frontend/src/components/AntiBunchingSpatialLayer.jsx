import { memo, useMemo } from 'react';
import { Polygon } from 'react-leaflet';
import bearing from '@turf/bearing';
import destination from '@turf/destination';
import { featureCollection, point, polygon } from '@turf/helpers';
import pointsWithinPolygon from '@turf/points-within-polygon';

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const vehicleCoordinates = (vehicle) => {
  const lng = toNumber(vehicle.lng ?? vehicle.longitude);
  const lat = toNumber(vehicle.lat ?? vehicle.latitude);
  return lat == null || lng == null ? null : [lng, lat];
};

const trajectoryBearing = (vehicle, current) => {
  const previousLng = toNumber(vehicle.prevLng ?? vehicle.previousLng ?? vehicle.longitudePrev);
  const previousLat = toNumber(vehicle.prevLat ?? vehicle.previousLat ?? vehicle.latitudePrev);

  if (previousLng != null && previousLat != null && (previousLng !== current[0] || previousLat !== current[1])) {
    return bearing([previousLng, previousLat], current);
  }

  const heading = toNumber(vehicle.heading);
  return heading == null ? 0 : heading;
};

const createSpatialBuffer = (vehicle, current, forwardMeters, rearMeters, widthMeters) => {
  const angle = trajectoryBearing(vehicle, current);
  const forward = destination(current, forwardMeters, angle, { units: 'meters' }).geometry.coordinates;
  const rear = destination(current, rearMeters, angle + 180, { units: 'meters' }).geometry.coordinates;
  const halfWidth = widthMeters / 2;
  const rightForward = destination(forward, halfWidth, angle + 90, { units: 'meters' }).geometry.coordinates;
  const leftForward = destination(forward, halfWidth, angle - 90, { units: 'meters' }).geometry.coordinates;
  const rightRear = destination(rear, halfWidth, angle + 90, { units: 'meters' }).geometry.coordinates;
  const leftRear = destination(rear, halfWidth, angle - 90, { units: 'meters' }).geometry.coordinates;

  return polygon([[leftForward, rightForward, rightRear, leftRear, leftForward]]);
};

const vehicleIdOf = (vehicle) => String(vehicle.id ?? vehicle.vehicleId ?? vehicle.plate ?? '');

function AntiBunchingSpatialLayer({
  vehicles = [],
  forwardMeters = 500,
  rearMeters = 200,
  widthMeters = 40,
}) {
  const spatialState = useMemo(() => {
    const geometries = [];
    const routeVehicles = new Map();

    for (const vehicle of vehicles) {
      const current = vehicleCoordinates(vehicle);
      if (!current) continue;
      const routeId = String(vehicle.routeId ?? '');
      const bucket = routeVehicles.get(routeId) ?? [];
      bucket.push({ vehicle, current });
      routeVehicles.set(routeId, bucket);
    }

    for (const vehicle of vehicles) {
      const current = vehicleCoordinates(vehicle);
      if (!current) continue;

      const buffer = createSpatialBuffer(vehicle, current, forwardMeters, rearMeters, widthMeters);
      const routeId = String(vehicle.routeId ?? '');
      const sameRoute = routeVehicles.get(routeId) ?? [];
      const ownId = vehicleIdOf(vehicle);
      const foreignPoints = featureCollection(
        sameRoute
          .filter(({ vehicle: other }) => vehicleIdOf(other) && vehicleIdOf(other) !== ownId)
          .map(({ current: coordinates }) => point(coordinates)),
      );
      const collisions = pointsWithinPolygon(foreignPoints, buffer).features.length;

      geometries.push({
        id: ownId || `${routeId}-${geometries.length}`,
        positions: buffer.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]),
        bunched: collisions > 0,
      });
    }

    return geometries;
  }, [vehicles, forwardMeters, rearMeters, widthMeters]);

  return (
    <>
      {spatialState.map(({ id, positions, bunched }) => (
        <Polygon
          key={id}
          positions={positions}
          pathOptions={{
            fillColor: bunched ? '#ef4444' : '#10b981',
            fillOpacity: bunched ? 0.6 : 0.2,
            color: bunched ? '#ef4444' : '#10b981',
            opacity: bunched ? 0.9 : 0.65,
            weight: 1,
          }}
          interactive={false}
        />
      ))}
    </>
  );
}

export default memo(AntiBunchingSpatialLayer);
