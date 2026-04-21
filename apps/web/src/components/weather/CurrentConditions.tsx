"use client";

import { getWeatherCondition } from "@weather/shared";
import { useLocationContext } from "@/context/LocationContext";
import { useWeatherContext, useRelativeTime } from "@/context/WeatherContext";
import { formatTemp } from "@/lib/units";
import WeatherIcon from "./WeatherIcon";

export default function CurrentConditions() {
  const { weather, lastUpdated } = useWeatherContext();
  const { currentLocation, preferences } = useLocationContext();
  const relative = useRelativeTime(lastUpdated);

  if (!weather || !currentLocation) return null;

  const today = weather.daily[0];
  const cond = getWeatherCondition(weather.current.weatherCode);

  return (
    <section className="glass-card px-6 py-8 text-center space-y-2">
      <div className="flex items-center justify-center gap-2 text-sm text-white/70">
        <span className="live-dot w-2 h-2 rounded-full bg-emerald-400 inline-block" />
        <span>Live · updated {relative || "just now"}</span>
      </div>

      <h1 className="text-2xl font-medium">{currentLocation.name}</h1>
      <p className="text-white/60 text-sm">{currentLocation.country}</p>

      <div className="flex items-center justify-center gap-4 pt-2">
        <WeatherIcon code={weather.current.weatherCode} size="text-6xl" />
        <div className="text-7xl font-thin tabular-nums">
          {formatTemp(weather.current.temperature, preferences.tempUnit)}
        </div>
      </div>

      <p className="text-lg text-white/80">{cond.description}</p>
      <p className="text-sm text-white/60">
        Feels like{" "}
        {formatTemp(weather.current.feelsLike, preferences.tempUnit)}
      </p>

      {today && (
        <p className="text-sm text-white/60 pt-1">
          H: {formatTemp(today.tempMax, preferences.tempUnit)} · L:{" "}
          {formatTemp(today.tempMin, preferences.tempUnit)}
        </p>
      )}
    </section>
  );
}
