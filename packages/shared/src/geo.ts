import type { Bounds, Coordinate } from "./types";

export function locationKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export function bboxAroundPoint(
  latitude: number,
  longitude: number,
  latDelta = 0.12,
  lonDelta = 0.18
): Bounds {
  return {
    north: latitude + latDelta,
    south: latitude - latDelta,
    east: longitude + lonDelta,
    west: longitude - lonDelta,
  };
}

export function centerOfBounds(bounds: Bounds): Coordinate {
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.east + bounds.west) / 2,
  };
}

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function interpolateLine(
  start: Coordinate,
  end: Coordinate,
  steps = 12
): Coordinate[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const ratio = index / steps;
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * ratio,
      longitude: start.longitude + (end.longitude - start.longitude) * ratio,
    };
  });
}

export function boundsForPoints(points: Coordinate[], padding = 0.12): Bounds {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);
  const latPad = Math.max((north - south) * padding, 0.03);
  const lonPad = Math.max((east - west) * padding, 0.03);
  return {
    north: north + latPad,
    south: south - latPad,
    east: east + lonPad,
    west: west - lonPad,
  };
}
