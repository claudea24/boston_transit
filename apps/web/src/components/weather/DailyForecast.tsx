"use client";

import { useMemo } from "react";
import { useLocationContext } from "@/context/LocationContext";
import { useWeatherContext } from "@/context/WeatherContext";
import { formatTemp } from "@/lib/units";
import WeatherIcon from "./WeatherIcon";

function dayLabel(date: string, idx: number, timezone: string): string {
  if (idx === 0) return "Today";
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return date.slice(5);
  }
}

export default function DailyForecast() {
  const { weather } = useWeatherContext();
  const { preferences } = useLocationContext();

  const { minAll, maxAll } = useMemo(() => {
    if (!weather) return { minAll: 0, maxAll: 0 };
    const mins = weather.daily.map((d) => d.tempMin);
    const maxs = weather.daily.map((d) => d.tempMax);
    return { minAll: Math.min(...mins), maxAll: Math.max(...maxs) };
  }, [weather]);

  if (!weather) return null;

  const range = Math.max(1, maxAll - minAll);

  return (
    <section className="glass-card p-4">
      <h2 className="text-xs uppercase tracking-wider text-white/60 px-2 pb-3">
        10-Day Forecast
      </h2>
      <ul className="divide-y divide-white/5">
        {weather.daily.map((d, i) => {
          const leftPct = ((d.tempMin - minAll) / range) * 100;
          const widthPct = ((d.tempMax - d.tempMin) / range) * 100;
          return (
            <li
              key={d.date}
              className="grid grid-cols-[72px_36px_48px_1fr_48px] items-center gap-3 py-2 px-2"
            >
              <span className="text-sm">{dayLabel(d.date, i, weather.timezone)}</span>
              <WeatherIcon code={d.weatherCode} size="text-xl" />
              <span className="text-sm tabular-nums text-white/60">
                {formatTemp(d.tempMin, preferences.tempUnit)}
              </span>
              <div className="relative h-1.5 bg-white/10 rounded-full">
                <div
                  className="absolute h-1.5 rounded-full bg-gradient-to-r from-sky-400 via-yellow-300 to-orange-400"
                  style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%` }}
                />
              </div>
              <span className="text-sm tabular-nums text-right">
                {formatTemp(d.tempMax, preferences.tempUnit)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
