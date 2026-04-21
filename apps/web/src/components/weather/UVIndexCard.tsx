"use client";

import { useWeatherContext } from "@/context/WeatherContext";
import StatCard from "./StatCard";

function uvCategory(v: number): string {
  if (v < 3) return "Low";
  if (v < 6) return "Moderate";
  if (v < 8) return "High";
  if (v < 11) return "Very High";
  return "Extreme";
}

export default function UVIndexCard() {
  const { weather } = useWeatherContext();
  if (!weather) return null;
  const uv = weather.current.uvIndex;
  return (
    <StatCard label="UV Index" icon="🔆" footer={uvCategory(uv)}>
      <div className="text-2xl tabular-nums">{uv.toFixed(0)}</div>
      <div className="h-1.5 rounded-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-500 relative">
        <div
          className="absolute -top-1 w-2 h-3.5 bg-white rounded-sm"
          style={{ left: `${Math.min(100, (uv / 11) * 100)}%`, transform: "translateX(-50%)" }}
        />
      </div>
    </StatCard>
  );
}
