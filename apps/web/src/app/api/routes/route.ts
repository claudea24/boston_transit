import { NextResponse } from "next/server";
import { decodePolyline } from "@/lib/polyline";

export interface RouteStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface TransitRoute {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  color: string;
  textColor: string;
  stops: RouteStop[];
  shapes: [number, number][][];
}

interface MbtaResource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: unknown } | null | undefined>;
}

let cache: { routes: TransitRoute[]; fetchedAt: number } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

function withApiKey(url: string): string {
  const key = process.env.MBTA_API_KEY;
  if (!key) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}api_key=${encodeURIComponent(key)}`;
}

async function mbtaFetch(url: string): Promise<Response> {
  const keyed = withApiKey(url);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(keyed, { cache: "no-store" });
    if (response.status !== 429) return response;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return fetch(keyed, { cache: "no-store" });
}

function relatedId(
  resource: MbtaResource | undefined,
  rel: string
): string | undefined {
  const data = resource?.relationships?.[rel]?.data;
  if (data && typeof data === "object" && !Array.isArray(data) && "id" in data) {
    return (data as { id?: string }).id;
  }
  return undefined;
}

function relatedIds(
  resource: MbtaResource | undefined,
  rel: string
): string[] {
  const data = resource?.relationships?.[rel]?.data;
  if (Array.isArray(data)) {
    return (data as Array<{ id?: string }>)
      .map((ref) => ref.id)
      .filter((id): id is string => typeof id === "string");
  }
  return [];
}

interface Bundle {
  routes: MbtaResource[];
  byType: Map<string, Map<string, MbtaResource>>;
}

async function fetchRoutesBundle(): Promise<Bundle> {
  const url =
    "https://api-v3.mbta.com/routes?filter[type]=0,1,2,3&include=route_patterns.representative_trip.stops,route_patterns.representative_trip.shape";
  const response = await mbtaFetch(url);
  if (!response.ok) return { routes: [], byType: new Map() };
  const body = (await response.json()) as {
    data?: MbtaResource[];
    included?: MbtaResource[];
  };
  const byType = new Map<string, Map<string, MbtaResource>>();
  for (const res of body.included ?? []) {
    if (!res.type || !res.id) continue;
    const typeMap = byType.get(res.type) ?? new Map<string, MbtaResource>();
    typeMap.set(res.id, res);
    byType.set(res.type, typeMap);
  }
  return { routes: body.data ?? [], byType };
}

function patternsForRoute(
  routeId: string,
  byType: Map<string, Map<string, MbtaResource>>
): MbtaResource[] {
  const patternMap = byType.get("route_pattern");
  if (!patternMap) return [];
  const patterns = [...patternMap.values()].filter(
    (pattern) => relatedId(pattern, "route") === routeId
  );
  const canonical = patterns.filter(
    (pattern) => (pattern.attributes?.canonical as boolean | undefined) === true
  );
  return canonical.length > 0 ? canonical : patterns;
}

function stopsAndShapesForRoute(
  routeId: string,
  byType: Map<string, Map<string, MbtaResource>>
): { stops: RouteStop[]; shapes: [number, number][][] } {
  const tripMap = byType.get("trip");
  const stopMap = byType.get("stop");
  const shapeMap = byType.get("shape");
  if (!tripMap || !stopMap) return { stops: [], shapes: [] };

  const stopsSeen = new Set<string>();
  const stops: RouteStop[] = [];
  const shapesSeen = new Set<string>();
  const shapes: [number, number][][] = [];

  for (const pattern of patternsForRoute(routeId, byType)) {
    const tripId = relatedId(pattern, "representative_trip");
    if (!tripId) continue;
    const trip = tripMap.get(tripId);
    if (!trip) continue;

    for (const stopId of relatedIds(trip, "stops")) {
      if (stopsSeen.has(stopId)) continue;
      const stop = stopMap.get(stopId);
      const attr = stop?.attributes as
        | { name?: string; latitude?: number | null; longitude?: number | null }
        | undefined;
      const lat = typeof attr?.latitude === "number" ? attr.latitude : null;
      const lon = typeof attr?.longitude === "number" ? attr.longitude : null;
      if (lat == null || lon == null) continue;
      stopsSeen.add(stopId);
      stops.push({
        id: stopId,
        name: attr?.name ?? stopId,
        latitude: lat,
        longitude: lon,
      });
    }

    const shapeId = relatedId(trip, "shape");
    if (!shapeId || shapesSeen.has(shapeId) || !shapeMap) continue;
    const shape = shapeMap.get(shapeId);
    const encoded = (shape?.attributes?.polyline as string | undefined) ?? undefined;
    if (!encoded) continue;
    try {
      const coordinates = decodePolyline(encoded);
      if (coordinates.length >= 2) {
        shapesSeen.add(shapeId);
        shapes.push(coordinates);
      }
    } catch {
      /* skip malformed shape */
    }
  }

  return { stops, shapes };
}

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return NextResponse.json({ routes: cache.routes, source: "cache" });
  }

  try {
    const { routes: rawRoutes, byType } = await fetchRoutesBundle();

    const routes: TransitRoute[] = rawRoutes.reduce<TransitRoute[]>((acc, route) => {
      const attr = route.attributes as
        | {
            short_name?: string;
            long_name?: string;
            type?: number;
            color?: string;
            text_color?: string;
          }
        | undefined;
      if (!route.id || !attr) return acc;
      const { stops, shapes } = stopsAndShapesForRoute(route.id, byType);
      acc.push({
        id: route.id,
        shortName: attr.short_name ?? route.id,
        longName: attr.long_name ?? route.id,
        type: attr.type ?? 3,
        color: attr.color ? `#${attr.color}` : "#64748b",
        textColor: attr.text_color ? `#${attr.text_color}` : "#ffffff",
        stops,
        shapes: attr.type !== 3 ? shapes : [],
      });
      return acc;
    }, []);

    cache = { routes, fetchedAt: Date.now() };
    return NextResponse.json({ routes, source: "mbta" });
  } catch (error) {
    console.error("routes fetch failed", error);
    return NextResponse.json({ error: "routes fetch failed", routes: [] }, { status: 502 });
  }
}
