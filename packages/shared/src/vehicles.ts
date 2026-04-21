import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { centerOfBounds, haversineMeters } from "./geo.js";
import type { Bounds, Coordinate, VehicleMode, VehiclePosition } from "./types.js";

interface VehicleFeedConfig {
  id: string;
  agencyId: string;
  label: string;
  mode: VehicleMode;
  url: string;
  center: Coordinate;
  radiusKm: number;
  resolveMode?: (routeId: string | null) => VehicleMode;
}

function modeForMbtaRoute(routeId: string | null): VehicleMode {
  if (!routeId) return "bus";
  if (routeId === "Mattapan") return "tram";
  if (/^(Red|Blue|Orange|Green-[A-Z])$/.test(routeId)) return "rail";
  if (routeId.startsWith("CR-")) return "rail";
  if (routeId.startsWith("Boat-")) return "ferry";
  return "bus";
}

interface VehicleFeedConfigInput {
  id?: unknown;
  agencyId?: unknown;
  label?: unknown;
  mode?: unknown;
  url?: unknown;
  center?: {
    latitude?: unknown;
    longitude?: unknown;
  } | null;
  radiusKm?: unknown;
}

const VEHICLE_FEEDS: VehicleFeedConfig[] = [
  {
    id: "mbta",
    agencyId: "o-drt-massbayareatransportationauthority",
    label: "MBTA",
    mode: "bus",
    url: "https://cdn.mbta.com/realtime/VehiclePositions.pb",
    center: { latitude: 42.3601, longitude: -71.0589 },
    radiusKm: 80,
    resolveMode: modeForMbtaRoute,
  },
];

let cachedVehicleFeeds: VehicleFeedConfig[] | null = null;

function parseVehicleMode(value: unknown): VehicleMode | null {
  switch (value) {
    case "bus":
    case "rail":
    case "tram":
    case "ferry":
    case "cable_car":
    case "other":
      return value;
    default:
      return null;
  }
}

function parseFeedConfig(input: VehicleFeedConfigInput): VehicleFeedConfig | null {
  const mode = parseVehicleMode(input.mode);
  const latitude = input.center?.latitude;
  const longitude = input.center?.longitude;

  if (
    typeof input.id !== "string" ||
    typeof input.agencyId !== "string" ||
    typeof input.label !== "string" ||
    typeof input.url !== "string" ||
    mode == null ||
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    typeof input.radiusKm !== "number"
  ) {
    return null;
  }

  return {
    id: input.id,
    agencyId: input.agencyId,
    label: input.label,
    mode,
    url: input.url,
    center: { latitude, longitude },
    radiusKm: input.radiusKm,
  };
}

function resolveEnvTemplate(url: string, feedId: string): string | null {
  const pattern = /\{\{([A-Z0-9_]+)\}\}/g;
  const missing: string[] = [];
  const resolved = url.replace(pattern, (_match, name: string) => {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
      return "";
    }
    return value;
  });

  if (missing.length > 0) {
    console.warn(
      `Skipping GTFS-RT feed "${feedId}" — missing env var(s): ${missing.join(", ")}`
    );
    return null;
  }

  return resolved;
}

function resolveFeedUrls(feeds: VehicleFeedConfig[]): VehicleFeedConfig[] {
  return feeds.flatMap((feed) => {
    const resolvedUrl = resolveEnvTemplate(feed.url, feed.id);
    return resolvedUrl == null ? [] : [{ ...feed, url: resolvedUrl }];
  });
}

function loadConfiguredFeeds(): VehicleFeedConfig[] {
  if (cachedVehicleFeeds) {
    return cachedVehicleFeeds;
  }

  const raw = process.env.GTFS_RT_FEEDS_JSON;
  if (!raw) {
    cachedVehicleFeeds = resolveFeedUrls(VEHICLE_FEEDS);
    console.log(`Loaded ${cachedVehicleFeeds.length} GTFS-RT vehicle feed configs`);
    return cachedVehicleFeeds;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("GTFS_RT_FEEDS_JSON must be a JSON array");
    }

    const merged = new Map(VEHICLE_FEEDS.map((feed) => [feed.id, feed]));
    for (const item of parsed) {
      const feed = parseFeedConfig(item as VehicleFeedConfigInput);
      if (!feed) {
        console.warn("Skipping invalid GTFS_RT_FEEDS_JSON feed entry", item);
        continue;
      }
      merged.set(feed.id, feed);
    }

    cachedVehicleFeeds = resolveFeedUrls([...merged.values()]);
    console.log(`Loaded ${cachedVehicleFeeds.length} GTFS-RT vehicle feed configs`);
    return cachedVehicleFeeds;
  } catch (error) {
    console.error("Failed to parse GTFS_RT_FEEDS_JSON; using default GTFS-RT feeds", error);
    cachedVehicleFeeds = resolveFeedUrls(VEHICLE_FEEDS);
    return cachedVehicleFeeds;
  }
}

function isWithinBounds(point: Coordinate, bounds: Bounds) {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

function selectFeedsForBounds(bounds: Bounds): VehicleFeedConfig[] {
  const viewportCenter = centerOfBounds(bounds);
  const feeds = loadConfiguredFeeds();

  return feeds.filter((feed) => {
    const distanceMeters = haversineMeters(viewportCenter, feed.center);
    return distanceMeters <= feed.radiusKm * 1000;
  });
}

function toIsoTimestamp(timestamp?: Long | number | null) {
  if (timestamp == null) {
    return new Date().toISOString();
  }

  const seconds =
    typeof timestamp === "number" ? timestamp : Number(timestamp.toString());
  if (!Number.isFinite(seconds)) {
    return new Date().toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

async function fetchFeedVehicles(
  feed: VehicleFeedConfig,
  bounds: Bounds
): Promise<VehiclePosition[]> {
  const response = await fetch(feed.url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${feed.label} GTFS-RT request failed: ${response.status} ${response.statusText} - ${body.slice(0, 200)}`
    );
  }

  const binary = new Uint8Array(await response.arrayBuffer());
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(binary) as {
    entity?: Array<{
      id?: string | null;
      vehicle?: {
        position?: {
          latitude?: number | null;
          longitude?: number | null;
          bearing?: number | null;
          speed?: number | null;
          timestamp?: Long | number | null;
        } | null;
        trip?: {
          tripId?: string | null;
          routeId?: string | null;
          currentStopSequence?: number | null;
        } | null;
        vehicle?: {
          id?: string | null;
          label?: string | null;
        } | null;
      } | null;
    }>;
  };

  return (message.entity ?? []).flatMap((entity) => {
    const position = entity.vehicle?.position;
    const latitude = position?.latitude;
    const longitude = position?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return [];
    }

    if (!isWithinBounds({ latitude, longitude }, bounds)) {
      return [];
    }

    const trip = entity.vehicle?.trip;
    const descriptor = entity.vehicle?.vehicle;
    const vehicleId =
      descriptor?.id ??
      descriptor?.label ??
      entity.id ??
      `${feed.id}-${trip?.tripId ?? "vehicle"}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`;

    return [
      {
        agencyId: feed.agencyId,
        vehicleId,
        routeId: trip?.routeId ?? undefined,
        tripId: trip?.tripId ?? undefined,
        routeShortName: trip?.routeId ?? descriptor?.label ?? undefined,
        mode: feed.resolveMode ? feed.resolveMode(trip?.routeId ?? null) : feed.mode,
        latitude,
        longitude,
        bearing: position?.bearing ?? undefined,
        speedKmh:
          typeof position?.speed === "number" ? position.speed * 3.6 : undefined,
        stopSequence: trip?.currentStopSequence ?? undefined,
        updatedAt: toIsoTimestamp(position?.timestamp),
      } satisfies VehiclePosition,
    ];
  });
}

export async function fetchVehiclesByBbox(bounds: Bounds): Promise<VehiclePosition[]> {
  const matchingFeeds = selectFeedsForBounds(bounds);
  if (matchingFeeds.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    matchingFeeds.map((feed) => fetchFeedVehicles(feed, bounds))
  );

  const vehicles: VehiclePosition[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      vehicles.push(...result.value);
      continue;
    }

    console.error("Vehicle feed fetch failed", result.reason);
  }

  return vehicles;
}

