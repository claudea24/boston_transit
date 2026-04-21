import type { VehiclePosition, VehiclePositionRow } from "@weather/shared";

export function rowToVehicle(row: VehiclePositionRow): VehiclePosition {
  return {
    agencyId: row.agency_id,
    vehicleId: row.vehicle_id,
    routeId: row.route_id ?? undefined,
    tripId: row.trip_id ?? undefined,
    routeShortName: row.route_short_name ?? undefined,
    routeColor: row.route_color ?? undefined,
    headsign: row.headsign ?? undefined,
    mode: row.mode,
    latitude: row.latitude,
    longitude: row.longitude,
    bearing: row.bearing ?? undefined,
    speedKmh: row.speed_kmh ?? undefined,
    delaySeconds: row.delay_seconds ?? undefined,
    stopSequence: row.stop_sequence ?? undefined,
    updatedAt: row.updated_at,
  };
}
