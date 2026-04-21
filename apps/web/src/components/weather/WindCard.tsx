"use client";

import { useLocationContext } from "@/context/LocationContext";
import { useWeatherContext } from "@/context/WeatherContext";
import { compassDirection, formatWind } from "@/lib/units";
import StatCard from "./StatCard";

export default function WindCard() {
  const { weather } = useWeatherContext();
  const { preferences } = useLocationContext();
  if (!weather) return null;
  const { windSpeed, windGusts, windDirection } = weather.current;
  return (
    <StatCard label="Wind" icon="💨" footer={`Gusts ${formatWind(windGusts, preferences.windUnit)}`}>
      <div className="text-2xl tabular-nums">
        {formatWind(windSpeed, preferences.windUnit)}
      </div>
      <div className="flex items-center gap-2 text-sm text-white/70">
        <span
          aria-hidden
          style={{ transform: `rotate(${windDirection}deg)` }}
          className="inline-block"
        >
          ↑
        </span>
        <span>{compassDirection(windDirection)}</span>
      </div>
    </StatCard>
  );
}
