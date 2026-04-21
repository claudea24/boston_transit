import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-server";
import {
  bboxAroundPoint,
  fetchVehiclesByBbox,
  type VehiclePosition,
} from "@weather/shared";

export async function POST(req: Request) {
  let body: { latitude?: number; longitude?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 });
  }

  try {
    const vehicles = await fetchVehiclesByBbox(bboxAroundPoint(latitude, longitude));
    const supabase = createServiceRoleClient();

    const rows = vehicles.map((vehicle: VehiclePosition) => ({
      agency_id: vehicle.agencyId,
      vehicle_id: vehicle.vehicleId,
      route_id: vehicle.routeId ?? null,
      route_short_name: vehicle.routeShortName ?? null,
      route_color: vehicle.routeColor ?? null,
      trip_id: vehicle.tripId ?? null,
      headsign: vehicle.headsign ?? null,
      mode: vehicle.mode,
      latitude: vehicle.latitude,
      longitude: vehicle.longitude,
      bearing: vehicle.bearing ?? null,
      speed_kmh: vehicle.speedKmh ?? null,
      delay_seconds: vehicle.delaySeconds ?? null,
      stop_sequence: vehicle.stopSequence ?? null,
      updated_at: vehicle.updatedAt,
    }));

    const { error } = await supabase
      .from("vehicle_positions")
      .upsert(rows, { onConflict: "agency_id,vehicle_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (error) {
    console.error("vehicle refresh failed", error);
    return NextResponse.json({ error: "Vehicle refresh failed" }, { status: 502 });
  }
}
