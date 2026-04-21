"use client";

import { getWeatherCondition } from "@weather/shared";
import { useLocationContext } from "@/context/LocationContext";
import { useWeatherContext } from "@/context/WeatherContext";
import { formatTemp, formatWind } from "@/lib/units";

export default function WeatherPill() {
  const { currentLocation, preferences } = useLocationContext();
  const { weather, loading } = useWeatherContext();

  if (!currentLocation) return null;

  const codeMeta = weather ? getWeatherCondition(weather.current.weatherCode) : null;

  return (
    <section className="panel panel--compact">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Current Weather</p>
          <h2>{currentLocation.name}</h2>
        </div>
        <span className={`weather-dot ${loading ? "live-dot" : ""}`} />
      </div>
      {weather ? (
        <div className="weather-pill">
          <div>
            <strong>{formatTemp(weather.current.temperature, preferences.tempUnit)}</strong>
            <p>{codeMeta?.description ?? "Live conditions"}</p>
          </div>
          <div className="weather-meta">
            <span>Feels like {formatTemp(weather.current.feelsLike, preferences.tempUnit)}</span>
            <span>Wind {formatWind(weather.current.windSpeed, preferences.windUnit)}</span>
            <span>{weather.current.humidity}% humidity</span>
          </div>
        </div>
      ) : (
        <p className="empty-copy">Fetching weather snapshot for this city.</p>
      )}
    </section>
  );
}
