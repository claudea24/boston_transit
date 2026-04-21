import { NextResponse } from "next/server";
import type { PlaceSuggestion } from "@weather/shared";

const BOSTON_BBOX = { west: -71.6, south: 42.05, east: -70.7, north: 42.65 };

function inBoston(lat: number, lon: number): boolean {
  return (
    lat >= BOSTON_BBOX.south &&
    lat <= BOSTON_BBOX.north &&
    lon >= BOSTON_BBOX.west &&
    lon <= BOSTON_BBOX.east
  );
}

type HereItem = {
  id?: string;
  title?: string;
  address?: {
    countryName?: string;
    state?: string;
  };
  position?: {
    lat: number;
    lng: number;
  };
};

type OpenMeteoGeoResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
};

function mapHereResults(items: HereItem[]): PlaceSuggestion[] {
  return items
    .filter((item) => item.position && item.title)
    .map((item) => ({
      id: item.id ?? item.title!,
      name: item.title!,
      country: item.address?.countryName ?? "",
      region: item.address?.state,
      label: [item.title, item.address?.state, item.address?.countryName]
        .filter(Boolean)
        .join(", "),
      latitude: item.position!.lat,
      longitude: item.position!.lng,
    }));
}

function mapOpenMeteoResults(results: OpenMeteoGeoResult[]): PlaceSuggestion[] {
  return results.map((result) => ({
    id: `${result.latitude},${result.longitude}`,
    name: result.name,
    country: result.country ?? "",
    region: result.admin1,
    label: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  }));
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const hereApiKey = process.env.HERE_API_KEY;

  try {
    if (hereApiKey) {
      const url = new URL("https://geocode.search.hereapi.com/v1/geocode");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "8");
      url.searchParams.set(
        "in",
        `bbox:${BOSTON_BBOX.west},${BOSTON_BBOX.south},${BOSTON_BBOX.east},${BOSTON_BBOX.north}`
      );
      url.searchParams.set("apiKey", hereApiKey);
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { items?: HereItem[] };
        const all = mapHereResults(payload.items ?? []);
        return NextResponse.json({
          results: all.filter((p) => inBoston(p.latitude, p.longitude)),
          source: "here",
        });
      }
    }

    const openMeteoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    openMeteoUrl.searchParams.set("name", q);
    openMeteoUrl.searchParams.set("count", "20");
    openMeteoUrl.searchParams.set("language", "en");
    const response = await fetch(openMeteoUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: `Geocoding error ${response.status}` }, { status: 502 });
    }
    const payload = (await response.json()) as { results?: OpenMeteoGeoResult[] };
    const mapped = mapOpenMeteoResults(payload.results ?? []);
    return NextResponse.json({
      results: mapped.filter((p) => inBoston(p.latitude, p.longitude)).slice(0, 8),
      source: "open-meteo",
    });
  } catch (error) {
    console.error("geocode failed", error);
    return NextResponse.json({ error: "Upstream geocoding failed" }, { status: 502 });
  }
}
