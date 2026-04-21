import { supabase } from "./supabase.js";
import {
  bboxAroundPoint,
  fetchMbtaTripUpdates,
  fetchVehiclesByBbox,
  fetchOpenMeteo,
  locationKey,
  type OpenMeteoWeather,
  type StopPrediction,
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

export async function pollPredictions(): Promise<number> {
  const predictions = await fetchMbtaTripUpdates();
  if (predictions.length === 0) {
    await sweepStalePredictions();
    return 0;
  }

  await upsertPredictions(predictions);
  await sweepStalePredictions();
  return predictions.length;
}

async function getDistinctLocations(): Promise<DistinctLocation[]> {
  const [savedPlaces, preferenceCentroids] = await Promise.all([
    loadOptionalLocations("saved_places"),
    loadActiveCityCentroids(),
  ]);

  const seedLocations = [
    { latitude: 42.3601, longitude: -71.0589 }, // Boston (MBTA)
  ];

  const seen = new Set<string>();
  const unique: DistinctLocation[] = [];
  for (const row of [...seedLocations, ...savedPlaces, ...preferenceCentroids]) {
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

async function upsertPredictions(predictions: StopPrediction[]) {
  const byKey = new Map<string, StopPrediction>();
  for (const p of predictions) {
    byKey.set(`${p.tripId}|${p.stopId}`, p);
  }
  const rows = [...byKey.values()].map((p) => ({
    agency_id: p.agencyId,
    trip_id: p.tripId,
    route_id: p.routeId ?? null,
    route_short_name: p.routeShortName ?? null,
    stop_id: p.stopId,
    stop_sequence: p.stopSequence ?? null,
    predicted_arrival: p.predictedArrival ?? null,
    predicted_departure: p.predictedDeparture ?? null,
    delay_seconds: p.delaySeconds ?? null,
    vehicle_id: p.vehicleId ?? null,
    updated_at: p.updatedAt,
  }));

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("stop_predictions")
      .upsert(chunk, { onConflict: "trip_id,stop_id" });
    if (error) throw error;
  }
}

async function sweepStalePredictions() {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { error } = await supabase
    .from("stop_predictions")
    .delete()
    .lt("predicted_arrival", cutoff);

  if (error && error.code !== "42P01") {
    console.warn("Unable to sweep stale predictions:", error.message);
  }
}
