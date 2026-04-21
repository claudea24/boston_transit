"use client";

import { useMemo } from "react";
import { useLocationContext } from "@/context/LocationContext";
import { useWeatherContext } from "@/context/WeatherContext";
import { formatTemp } from "@/lib/units";
import WeatherIcon from "./WeatherIcon";

function formatHour(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export default function HourlyForecast() {
  const { weather } = useWeatherContext();
  const { preferences } = useLocationContext();

  const upcoming = useMemo(() => {
    if (!weather) return [];
    const now = Date.now();
    const cutoff = now - 60 * 60 * 1000;
    return weather.hourly
      .filter((h) => new Date(h.time).getTime() >= cutoff)
      .slice(0, 24);
  }, [weather]);

  if (!weather || upcoming.length === 0) return null;

  return (
    <section className="glass-card p-4">
      <h2 className="text-xs uppercase tracking-wider text-white/60 px-2 pb-3">
        Hourly Forecast
      </h2>
      <div className="flex gap-4 overflow-x-auto no-scrollbar px-2 pb-2">
        {upcoming.map((h) => {
          const isNow = Math.abs(new Date(h.time).getTime() - Date.now()) < 60 * 60 * 1000;
          return (
            <div
              key={h.time}
              className={`flex flex-col items-center gap-2 min-w-[64px] ${
                isNow ? "text-white" : "text-white/80"
              }`}
            >
              <span className="text-xs">
                {isNow ? "Now" : formatHour(h.time, weather.timezone)}
              </span>
              <WeatherIcon code={h.weatherCode} size="text-2xl" />
              {h.precipitationProbability > 10 && (
                <span className="text-[10px] text-sky-300">
                  {Math.round(h.precipitationProbability)}%
                </span>
              )}
              <span className="text-sm tabular-nums">
                {formatTemp(h.temperature, preferences.tempUnit)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
