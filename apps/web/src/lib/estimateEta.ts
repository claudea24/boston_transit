import { haversineMeters, type VehiclePosition } from "@weather/shared";

const DEFAULT_SPEED_KMH: Record<string, number> = {
  rail: 35,
  tram: 22,
  bus: 20,
  ferry: 30,
  cable_car: 15,
  other: 20,
};

const MIN_SPEED_KMH = 8;
const MAX_USABLE_DISTANCE_M = 15_000;

export interface EstimatedEta {
  kind: "estimated";
  vehicleId: string;
  routeId: string | undefined;
  routeShortName: string | undefined;
  distanceMeters: number;
  etaMs: number;
}

export function estimateEtaForStop(
  stop: { latitude: number; longitude: number },
  vehicles: VehiclePosition[],
  routeIds: Set<string>
): EstimatedEta[] {
  const candidates: EstimatedEta[] = [];
  for (const vehicle of vehicles) {
    if (!vehicle.routeId || !routeIds.has(vehicle.routeId)) continue;
    const distanceMeters = haversineMeters(
      { latitude: vehicle.latitude, longitude: vehicle.longitude },
      { latitude: stop.latitude, longitude: stop.longitude }
    );
    if (distanceMeters > MAX_USABLE_DISTANCE_M) continue;

    const baseline = DEFAULT_SPEED_KMH[vehicle.mode] ?? DEFAULT_SPEED_KMH.other;
    const speedKmh = Math.max(vehicle.speedKmh ?? 0, baseline, MIN_SPEED_KMH);
    const etaMs = (distanceMeters / 1000 / speedKmh) * 60 * 60 * 1000;
    candidates.push({
      kind: "estimated",
      vehicleId: vehicle.vehicleId,
      routeId: vehicle.routeId,
      routeShortName: vehicle.routeShortName,
      distanceMeters,
      etaMs,
    });
  }
  candidates.sort((a, b) => a.etaMs - b.etaMs);
  return candidates.slice(0, 5);
}
