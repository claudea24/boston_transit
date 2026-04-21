import { NextResponse } from "next/server";
import type { PlaceSuggestion } from "@weather/shared";

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
      url.searchParams.set("limit", "5");
      url.searchParams.set("apiKey", hereApiKey);
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { items?: HereItem[] };
        return NextResponse.json({
          results: mapHereResults(payload.items ?? []),
          source: "here",
        });
      }
    }

    const openMeteoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    openMeteoUrl.searchParams.set("name", q);
    openMeteoUrl.searchParams.set("count", "5");
    openMeteoUrl.searchParams.set("language", "en");
    const response = await fetch(openMeteoUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: `Geocoding error ${response.status}` }, { status: 502 });
    }
    const payload = (await response.json()) as { results?: OpenMeteoGeoResult[] };
    return NextResponse.json({
      results: mapOpenMeteoResults(payload.results ?? []),
      source: "open-meteo",
    });
  } catch (error) {
    console.error("geocode failed", error);
    return NextResponse.json({ error: "Upstream geocoding failed" }, { status: 502 });
  }
}
