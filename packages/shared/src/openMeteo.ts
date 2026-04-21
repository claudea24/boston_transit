import type { CurrentWeather, DailyForecast, HourlyForecast } from "./types";
import { locationKey } from "./geo";

export interface OpenMeteoWeather {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
}

export async function fetchOpenMeteo(
  latitude: number,
  longitude: number
): Promise<OpenMeteoWeather> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
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

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
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
