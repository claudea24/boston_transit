"use client";

import { useWeatherContext } from "@/context/WeatherContext";
import StatCard from "./StatCard";

export default function VisibilityCard() {
  const { weather } = useWeatherContext();
  if (!weather) return null;
  // Open-Meteo visibility is in meters (hourly). Use the closest hour.
  const nowTs = Date.now();
  const h = weather.hourly.reduce((closest, cur) => {
    const dCur = Math.abs(new Date(cur.time).getTime() - nowTs);
    const dClosest = Math.abs(new Date(closest.time).getTime() - nowTs);
    return dCur < dClosest ? cur : closest;
  }, weather.hourly[0]);
  const miles = (h.visibility ?? 0) / 1609.34;
  const desc = miles > 6 ? "Clear" : miles > 2 ? "Hazy" : "Poor";
  return (
    <StatCard label="Visibility" icon="👁" footer={desc}>
      <div className="text-2xl tabular-nums">{miles.toFixed(1)} mi</div>
    </StatCard>
  );
}
