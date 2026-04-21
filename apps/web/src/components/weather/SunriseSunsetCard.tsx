"use client";

import { useWeatherContext } from "@/context/WeatherContext";
import StatCard from "./StatCard";

function formatTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export default function SunriseSunsetCard() {
  const { weather } = useWeatherContext();
  if (!weather) return null;
  const today = weather.daily[0];
  if (!today) return null;
  return (
    <StatCard
      label="Sunrise"
      icon="🌅"
      footer={`Sunset ${formatTime(today.sunset, weather.timezone)}`}
    >
      <div className="text-2xl tabular-nums">
        {formatTime(today.sunrise, weather.timezone)}
      </div>
    </StatCard>
  );
}
