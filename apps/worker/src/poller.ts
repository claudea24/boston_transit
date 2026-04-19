import { supabase } from "./supabase.js";
import type { CurrentWeather, HourlyForecast, DailyForecast } from "@weather/shared";

interface DistinctLocation {
  latitude: number;
  longitude: number;
}

export async function pollWeatherData(): Promise<number> {
  const locations = await getDistinctLocations();

  if (locations.length === 0) {
    console.log("No saved locations to poll");
    return 0;
  }

  let fetched = 0;
  for (const loc of locations) {
    try {
      const weather = await fetchOpenMeteo(loc.latitude, loc.longitude);
      await upsertWeatherData(loc, weather);
      fetched++;
    } catch (error) {
      console.error(
        `Failed to fetch weather for ${loc.latitude},${loc.longitude}:`,
        error
      );
    }
  }

  return fetched;
}

async function getDistinctLocations(): Promise<DistinctLocation[]> {
  const { data, error } = await supabase
    .from("saved_locations")
    .select("latitude, longitude");

  if (error) throw error;

  // Deduplicate by rounding to 2 decimal places
  const seen = new Set<string>();
  const unique: DistinctLocation[] = [];
  for (const row of data ?? []) {
    const key = `${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ latitude: row.latitude, longitude: row.longitude });
    }
  }

  return unique;
}

async function fetchOpenMeteo(
  lat: number,
  lon: number
): Promise<{
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
}> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,uv_index",
    hourly:
      "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,visibility,uv_index",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    forecast_days: "10",
    timezone: "auto",
  });

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params}`
  );
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();

  const current: CurrentWeather = {
    temperature: raw.current.temperature_2m,
    feelsLike: raw.current.apparent_temperature,
    weatherCode: raw.current.weather_code,
    humidity: raw.current.relative_humidity_2m,
    precipitation: raw.current.precipitation,
    windSpeed: raw.current.wind_speed_10m,
    windDirection: raw.current.wind_direction_10m,
    windGusts: raw.current.wind_gusts_10m,
    pressure: raw.current.surface_pressure,
    uvIndex: raw.current.uv_index,
  };

  const hourly: HourlyForecast[] = raw.hourly.time.map(
    (time: string, i: number) => ({
      time,
      temperature: raw.hourly.temperature_2m[i],
      precipitationProbability: raw.hourly.precipitation_probability[i],
      precipitation: raw.hourly.precipitation[i],
      weatherCode: raw.hourly.weather_code[i],
      windSpeed: raw.hourly.wind_speed_10m[i],
      visibility: raw.hourly.visibility[i],
      uvIndex: raw.hourly.uv_index[i],
    })
  );

  const daily: DailyForecast[] = raw.daily.time.map(
    (date: string, i: number) => ({
      date,
      weatherCode: raw.daily.weather_code[i],
      tempMax: raw.daily.temperature_2m_max[i],
      tempMin: raw.daily.temperature_2m_min[i],
      feelsLikeMax: raw.daily.apparent_temperature_max[i],
      feelsLikeMin: raw.daily.apparent_temperature_min[i],
      sunrise: raw.daily.sunrise[i],
      sunset: raw.daily.sunset[i],
      precipitationSum: raw.daily.precipitation_sum[i],
      precipitationProbabilityMax: raw.daily.precipitation_probability_max[i],
      windSpeedMax: raw.daily.wind_speed_10m_max[i],
      windGustsMax: raw.daily.wind_gusts_10m_max[i],
      uvIndexMax: raw.daily.uv_index_max[i],
    })
  );

  return { current, hourly, daily, timezone: raw.timezone };
}

async function upsertWeatherData(
  loc: DistinctLocation,
  weather: {
    current: CurrentWeather;
    hourly: HourlyForecast[];
    daily: DailyForecast[];
    timezone: string;
  }
) {
  const locationKey = `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;

  const { error } = await supabase.from("weather_data").upsert(
    {
      location_key: locationKey,
      latitude: loc.latitude,
      longitude: loc.longitude,
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
