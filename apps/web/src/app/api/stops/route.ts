import { NextResponse } from "next/server";

interface StopRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  locationType: number;
  parentStation: string | null;
}

interface MbtaStopAttributes {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_type?: number;
}

interface MbtaStop {
  id?: string;
  attributes?: MbtaStopAttributes;
  relationships?: {
    parent_station?: { data?: { id?: string } | null };
  };
}

let cache: { stops: StopRecord[]; fetchedAt: number } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return NextResponse.json({ stops: cache.stops, source: "cache" });
  }

  try {
    const allRaw: MbtaStop[] = [];
    let offset = 0;
    const pageSize = 2000;
    while (true) {
      const url = `https://api-v3.mbta.com/stops?filter[location_type]=0,1&page[limit]=${pageSize}&page[offset]=${offset}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        return NextResponse.json(
          { error: `MBTA stops request failed: ${response.status}`, stops: [] },
          { status: 502 }
        );
      }
      const body = (await response.json()) as { data?: MbtaStop[] };
      const batch = body.data ?? [];
      allRaw.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
      if (offset > 20000) break;
    }
    const stops: StopRecord[] = allRaw.reduce<StopRecord[]>((acc, stop) => {
      const attr = stop.attributes;
      if (!stop.id || !attr) return acc;
      const lat = typeof attr.latitude === "number" ? attr.latitude : null;
      const lon = typeof attr.longitude === "number" ? attr.longitude : null;
      if (lat == null || lon == null) return acc;
      acc.push({
        id: stop.id,
        name: attr.name ?? stop.id,
        latitude: lat,
        longitude: lon,
        locationType: attr.location_type ?? 0,
        parentStation: stop.relationships?.parent_station?.data?.id ?? null,
      });
      return acc;
    }, []);
    cache = { stops, fetchedAt: Date.now() };
    return NextResponse.json({ stops, source: "mbta" });
  } catch (error) {
    console.error("stops fetch failed", error);
    return NextResponse.json({ error: "stops fetch failed", stops: [] }, { status: 502 });
  }
}
