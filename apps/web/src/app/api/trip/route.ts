import { NextResponse } from "next/server";
import { buildFallbackItineraries } from "@weather/shared";
import type { Coordinate, Itinerary, PlaceSuggestion } from "@weather/shared";

type HereSection = {
  type?: string;
  departure?: { time?: string; place?: { originalLocation?: Coordinate } };
  arrival?: { time?: string; place?: { originalLocation?: Coordinate } };
  transport?: { mode?: string; name?: string; color?: string };
  summary?: { duration?: number; length?: number };
};

type HereRoute = {
  id?: string;
  sections?: HereSection[];
};

function toPlace(input: unknown, fallbackName: string): PlaceSuggestion | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<PlaceSuggestion>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number"
  ) {
    return null;
  }
  return {
    id: candidate.id ?? `${candidate.latitude},${candidate.longitude}`,
    name: candidate.name || fallbackName,
    country: candidate.country ?? "",
    region: candidate.region,
    label: candidate.label ?? candidate.name,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    timezone: candidate.timezone,
  };
}

function mapHereMode(mode?: string): "walk" | "bus" | "train" | "tram" {
  if (!mode) return "walk";
  const normalized = mode.toLowerCase();
  if (normalized.includes("rail") || normalized.includes("subway") || normalized.includes("train")) {
    return "train";
  }
  if (normalized.includes("tram")) return "tram";
  if (normalized.includes("bus")) return "bus";
  return "walk";
}

function mapHereRoutes(routes: HereRoute[], from: PlaceSuggestion, to: PlaceSuggestion): Itinerary[] {
  return routes.map((route, routeIndex) => {
    const legs = (route.sections ?? []).map((section, legIndex) => {
      const legFrom = section.departure?.place?.originalLocation ?? {
        latitude: legIndex === 0 ? from.latitude : from.latitude,
        longitude: legIndex === 0 ? from.longitude : from.longitude,
      };
      const legTo = section.arrival?.place?.originalLocation ?? {
        latitude: legIndex === route.sections!.length - 1 ? to.latitude : to.latitude,
        longitude: legIndex === route.sections!.length - 1 ? to.longitude : to.longitude,
      };
      const departure = section.departure?.time ?? new Date().toISOString();
      const arrival = section.arrival?.time ?? departure;
      const durationMinutes = Math.max(
        1,
        Math.round((Date.parse(arrival) - Date.parse(departure)) / 60_000)
      );
      return {
        id: `${route.id ?? routeIndex}-${legIndex}`,
        mode: mapHereMode(section.transport?.mode),
        label: section.transport?.name ?? (section.type === "pedestrian" ? "Walk" : "Transit"),
        fromName: legIndex === 0 ? from.name : "Transfer",
        toName: legIndex === route.sections!.length - 1 ? to.name : "Connection",
        latitude: legTo.latitude,
        longitude: legTo.longitude,
        departureTime: departure,
        arrivalTime: arrival,
        scheduledDepartureTime: departure,
        scheduledArrivalTime: arrival,
        delaySeconds: 0,
        durationMinutes,
        distanceMeters: section.summary?.length ?? 0,
        polyline: [legFrom, legTo],
        routeColor: section.transport?.color ?? undefined,
        covered: section.type !== "pedestrian",
      };
    });

    const walkingMeters = legs
      .filter((leg) => leg.mode === "walk")
      .reduce((sum, leg) => sum + leg.distanceMeters, 0);

    return {
      id: route.id ?? `here-${routeIndex}`,
      summary: legs.map((leg) => leg.mode.toUpperCase()).join(" + "),
      durationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
      walkingMeters,
      waitMinutes: 4,
      transfers: Math.max(0, legs.filter((leg) => leg.mode !== "walk").length - 1),
      weatherScore: 0,
      modes: legs.map((leg) => leg.mode),
      legs,
    };
  });
}

export async function POST(req: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const from = toPlace(body.from, "From");
  const to = toPlace(body.to, "To");
  if (!from || !to) {
    return NextResponse.json({ error: "Both from and to are required." }, { status: 400 });
  }

  const hereApiKey = process.env.HERE_API_KEY;

  try {
    if (hereApiKey) {
      const url = new URL("https://transit.router.hereapi.com/v8/routes");
      url.searchParams.set("origin", `${from.latitude},${from.longitude}`);
      url.searchParams.set("destination", `${to.latitude},${to.longitude}`);
      url.searchParams.set("return", "polyline,travelSummary,intermediate");
      url.searchParams.set("modes", "publicTransport");
      url.searchParams.set("apiKey", hereApiKey);

      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { routes?: HereRoute[] };
        const itineraries = mapHereRoutes(payload.routes ?? [], from, to);
        if (itineraries.length > 0) {
          return NextResponse.json({ itineraries, source: "here" });
        }
      }
    }

    return NextResponse.json({
      itineraries: buildFallbackItineraries(from, to),
      source: "fallback",
    });
  } catch (error) {
    console.error("trip planning failed", error);
    return NextResponse.json(
      { itineraries: buildFallbackItineraries(from, to), source: "fallback" },
      { status: 200 }
    );
  }
}
