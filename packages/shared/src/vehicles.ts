import { bboxAroundPoint, centerOfBounds, locationKey } from "./geo";
import type { Bounds, VehicleMode, VehiclePosition } from "./types";

function seededFraction(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function routeTypeToMode(routeType?: number): VehicleMode {
  switch (routeType) {
    case 0:
      return "tram";
    case 1:
    case 2:
      return "rail";
    case 4:
      return "ferry";
    case 5:
      return "cable_car";
    case 3:
      return "bus";
    default:
      return "other";
  }
}

function syntheticVehicles(bounds: Bounds): VehiclePosition[] {
  const { latitude, longitude } = centerOfBounds(bounds);
  const key = locationKey(latitude, longitude);
  const now = new Date();
  const routeTemplates = [
    { id: "red-line", label: "Red Line", color: "#2563eb", mode: "rail" as const },
    { id: "b12", label: "B12", color: "#f97316", mode: "bus" as const },
    { id: "green-loop", label: "Green Loop", color: "#16a34a", mode: "tram" as const },
  ];

  return routeTemplates.map((route, index) => {
    const offsetA = seededFraction(`${key}-${route.id}-a`);
    const offsetB = seededFraction(`${key}-${route.id}-b`);
    return {
      agencyId: "demo-agency",
      vehicleId: `${key}-${route.id}`,
      routeId: route.id,
      tripId: `${route.id}-${now.getUTCHours()}`,
      routeShortName: route.label,
      routeColor: route.color,
      mode: route.mode,
      latitude: latitude + (offsetA - 0.5) * 0.08 + index * 0.005,
      longitude: longitude + (offsetB - 0.5) * 0.1 - index * 0.004,
      bearing: Math.round(offsetA * 360),
      speedKmh: route.mode === "rail" ? 46 : route.mode === "tram" ? 28 : 22,
      delaySeconds: index === 1 ? 180 : 0,
      headsign: index === 0 ? "Downtown" : "Crosstown",
      updatedAt: now.toISOString(),
    };
  });
}

export async function fetchVehiclesByBbox(bounds: Bounds): Promise<VehiclePosition[]> {
  const transitlandApiKey = process.env.TRANSITLAND_API_KEY;
  if (!transitlandApiKey) {
    return syntheticVehicles(bounds);
  }

  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");

  try {
    const url = new URL("https://transit.land/api/v2/rest/vehicles");
    url.searchParams.set("bbox", bbox);
    url.searchParams.set("api_key", transitlandApiKey);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return syntheticVehicles(bounds);
    }
    const payload = (await response.json()) as {
      vehicles?: Array<{
        agency?: { onestop_id?: string };
        vehicle_id?: string;
        route_id?: string;
        stop_sequence?: number;
        timestamp?: string;
        headsign?: string;
        geometry?: { coordinates?: [number, number] };
        trip_id?: string;
        vehicle?: { position?: { lat?: number; lon?: number; bearing?: number; speed?: number } };
        route?: {
          onestop_id?: string;
          route_short_name?: string;
          route_color?: string;
          route_type?: number;
        };
        trip_update?: { delay?: number };
      }>;
    };

    const mapped = (payload.vehicles ?? [])
      .flatMap((vehicle) => {
        const position = vehicle.vehicle?.position;
        const coordinates = vehicle.geometry?.coordinates;
        const latitude = position?.lat ?? coordinates?.[1];
        const longitude = position?.lon ?? coordinates?.[0];
        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number"
        ) {
          return [];
        }
        return [{
          agencyId: vehicle.agency?.onestop_id ?? "unknown-agency",
          vehicleId: vehicle.vehicle_id ?? `${locationKey(latitude, longitude)}-${vehicle.route_id ?? "route"}`,
          routeId: vehicle.route?.onestop_id ?? vehicle.route_id ?? undefined,
          tripId: vehicle.trip_id,
          routeShortName: vehicle.route?.route_short_name ?? vehicle.route_id ?? undefined,
          routeColor: `#${vehicle.route?.route_color ?? "3b82f6"}`,
          headsign: vehicle.headsign,
          mode: routeTypeToMode(vehicle.route?.route_type),
          latitude,
          longitude,
          bearing: position?.bearing,
          speedKmh: typeof position?.speed === "number" ? position.speed * 3.6 : undefined,
          delaySeconds: vehicle.trip_update?.delay ?? undefined,
          stopSequence: vehicle.stop_sequence,
          updatedAt: new Date(vehicle.timestamp ?? Date.now()).toISOString(),
        } satisfies VehiclePosition];
      });

    return mapped.length > 0 ? mapped : syntheticVehicles(bounds);
  } catch (error) {
    console.error("fetchVehiclePositions fell back to synthetic vehicles", error);
    return syntheticVehicles(bounds);
  }
}

export async function fetchVehiclePositions(
  latitude: number,
  longitude: number
): Promise<VehiclePosition[]> {
  return fetchVehiclesByBbox(bboxAroundPoint(latitude, longitude));
}
