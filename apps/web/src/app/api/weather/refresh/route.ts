import { NextResponse } from "next/server";
import { fetchOpenMeteo, locationKey } from "@weather/shared";
import { createServiceRoleClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  let body: { latitude?: number; longitude?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "latitude and longitude required" },
      { status: 400 }
    );
  }

  try {
    const weather = await fetchOpenMeteo(lat, lon);
    const key = locationKey(lat, lon);
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("weather_data").upsert(
      {
        location_key: key,
        latitude: lat,
        longitude: lon,
        current_data: weather.current,
        hourly_data: weather.hourly,
        daily_data: weather.daily,
        timezone: weather.timezone,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "location_key" }
    );
    if (error) {
      console.error("upsert weather_data failed", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, location_key: key });
  } catch (err) {
    console.error("weather/refresh failed", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
