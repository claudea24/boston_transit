"use client";

import { useWeatherContext } from "@/context/WeatherContext";
import StatCard from "./StatCard";

export default function PressureCard() {
  const { weather } = useWeatherContext();
  if (!weather) return null;
  const hpa = weather.current.pressure;
  // Simple trend: compare current to ~3h ago from hourly (if available)
  const nowIdx = weather.hourly.findIndex(
    (h) => new Date(h.time).getTime() >= Date.now()
  );
  const prior = nowIdx > 3 ? weather.hourly[nowIdx - 3] : null;
  // Open-Meteo hourly does not include surface_pressure by default in our query,
  // so trend is often unavailable; fall back to "Steady".
  let trend = "Steady";
  if (prior && "pressure" in prior) {
    const diff = hpa - (prior as unknown as { pressure?: number }).pressure!;
    if (diff > 1) trend = "Rising ↑";
    else if (diff < -1) trend = "Falling ↓";
  }
  return (
    <StatCard label="Pressure" icon="📊" footer={trend}>
      <div className="text-2xl tabular-nums">{hpa.toFixed(0)} hPa</div>
    </StatCard>
  );
}
