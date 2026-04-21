"use client";

import { useWeatherContext } from "@/context/WeatherContext";
import { useLocationContext } from "@/context/LocationContext";
import { formatTemp } from "@/lib/units";
import StatCard from "./StatCard";

// Magnus dew point (°C) from temp (°C) and RH%
function dewPointF(tempF: number, rh: number): number {
  const tempC = ((tempF - 32) * 5) / 9;
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(Math.max(1, rh) / 100);
  const dpC = (b * alpha) / (a - alpha);
  return (dpC * 9) / 5 + 32;
}

export default function HumidityCard() {
  const { weather } = useWeatherContext();
  const { preferences } = useLocationContext();
  if (!weather) return null;
  const rh = weather.current.humidity;
  const dp = dewPointF(weather.current.temperature, rh);
  return (
    <StatCard
      label="Humidity"
      icon="💦"
      footer={`Dew point ${formatTemp(dp, preferences.tempUnit)}`}
    >
      <div className="text-2xl tabular-nums">{Math.round(rh)}%</div>
    </StatCard>
  );
}
