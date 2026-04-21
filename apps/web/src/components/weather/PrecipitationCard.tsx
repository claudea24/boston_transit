"use client";

import { useWeatherContext } from "@/context/WeatherContext";
import StatCard from "./StatCard";

export default function PrecipitationCard() {
  const { weather } = useWeatherContext();
  if (!weather) return null;

  const next24 = weather.hourly.slice(0, 24);
  const nextRainIdx = next24.findIndex((h) => h.precipitationProbability >= 40);
  const summary =
    nextRainIdx === -1
      ? "No rain expected in next 24h"
      : nextRainIdx === 0
      ? "Rain likely soon"
      : `Rain expected in ~${nextRainIdx}h`;

  const today = weather.daily[0];

  return (
    <StatCard
      label="Precipitation"
      icon="💧"
      footer={`${today?.precipitationSum?.toFixed(2) ?? "0.00"} in today`}
    >
      <div className="text-2xl tabular-nums">
        {Math.round(today?.precipitationProbabilityMax ?? 0)}%
      </div>
      <div className="text-sm text-white/70">{summary}</div>
    </StatCard>
  );
}
