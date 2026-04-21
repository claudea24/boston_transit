import { supabase } from "./supabase.js";
import {
  bboxAroundPoint,
  fetchVehiclesByBbox,
  fetchOpenMeteo,
  locationKey,
  type OpenMeteoWeather,
  type VehiclePosition,
} from "@weather/shared";

interface DistinctLocation {
  latitude: number;
  longitude: number;
}

export async function pollWeatherData(): Promise<number> {
  const locations = await getDistinctLocations();
  if (locations.length === 0) {
    console.log("No locations available for weather polling");
    return 0;
  }

  let fetched = 0;
  for (const location of locations) {
    try {
      const weather = await fetchOpenMeteo(location.latitude, location.longitude);
      await upsertWeatherData(location, weather);
      fetched++;
    } catch (error) {
      console.error(
        `Failed weather fetch for ${location.latitude},${location.longitude}:`,
        error
      );
    }
  }

  return fetched;
}

export async function pollVehicleData(): Promise<number> {
  const locations = await getDistinctLocations();
  if (locations.length === 0) {
    console.log("No locations available for vehicle polling");
    return 0;
  }

  let total = 0;
  for (const location of locations) {
    try {
      const vehicles = await fetchVehiclesByBbox(
        bboxAroundPoint(location.latitude, location.longitude)
      );
      await upsertVehicleData(vehicles);
      total += vehicles.length;
    } catch (error) {
      console.error(
        `Failed vehicle fetch for ${location.latitude},${location.longitude}:`,
        error
      );
    }
  }

  await sweepStaleVehicles();

  return total;
}

async function getDistinctLocations(): Promise<DistinctLocation[]> {
  const { data, error } = await supabase
    .from("saved_locations")
    .select("latitude, longitude");

  if (error) throw error;

  const [savedPlaces, preferenceCentroids] = await Promise.all([
    loadOptionalLocations("saved_places"),
    loadActiveCityCentroids(),
  ]);

  const seedLocations = [
    { latitude: 41.8781, longitude: -87.6298 },
    { latitude: 40.7128, longitude: -74.006 },
  ];

  const seen = new Set<string>();
  const unique: DistinctLocation[] = [];
  for (const row of [...seedLocations, ...(data ?? []), ...savedPlaces, ...preferenceCentroids]) {
    const key = locationKey(row.latitude, row.longitude);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ latitude: row.latitude, longitude: row.longitude });
    }
  }

  return unique;
}

async function upsertWeatherData(
  location: DistinctLocation,
  weather: OpenMeteoWeather
) {
  const key = locationKey(location.latitude, location.longitude);
  const { error } = await supabase.from("weather_data").upsert(
    {
      location_key: key,
      latitude: location.latitude,
      longitude: location.longitude,
      current_data: weather.current,
      hourly_data: weather.hourly,
      daily_data: weather.daily,
      timezone: weather.timezone,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "location_key" }
  );

  if (error) throw error;
}

async function upsertVehicleData(
  vehicles: VehiclePosition[]
) {
  const rows = vehicles.map((vehicle) => ({
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
  if (error) throw error;
}

async function loadOptionalLocations(table: "saved_places"): Promise<DistinctLocation[]> {
  const { data, error } = await supabase.from(table).select("latitude, longitude");
  if (error) {
    if (error.code !== "42P01") {
      console.warn(`Unable to load ${table}:`, error.message);
    }
    return [];
  }
  return (data ?? []).map((row) => ({
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

async function loadActiveCityCentroids(): Promise<DistinctLocation[]> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("active_city_centroid");

  if (error) {
    console.warn("Unable to load active city centroids:", error.message);
    return [];
  }

  return (data ?? []).reduce<DistinctLocation[]>((locations, row) => {
    const point = parsePoint(row.active_city_centroid);
    if (!point) {
      return locations;
    }

    const [latitude, longitude] = point;
    locations.push({ latitude, longitude });
    return locations;
  }, []);
}

function parsePoint(value: unknown): [number, number] | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^\(([-\d.]+),([-\d.]+)\)$/);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return [latitude, longitude];
}

async function sweepStaleVehicles() {
  const cutoff = new Date(Date.now() - 3 * 60_000).toISOString();
  const { error } = await supabase
    .from("vehicle_positions")
    .delete()
    .lt("updated_at", cutoff);

  if (error && error.code !== "42P01") {
    console.warn("Unable to sweep stale vehicle rows:", error.message);
  }
}
