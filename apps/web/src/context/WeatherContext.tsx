"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  WeatherDataRow,
} from "@weather/shared";
import { locationKey } from "@weather/shared";
import { useSupabase } from "@/lib/supabase";
import { useLocationContext } from "./LocationContext";

type Weather = {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
  fetchedAt: string;
  locationKey: string;
};

interface WeatherContextValue {
  weather: Weather | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const WeatherContext = createContext<WeatherContextValue | null>(null);

function rowToWeather(row: WeatherDataRow): Weather {
  return {
    current: row.current_data,
    hourly: row.hourly_data,
    daily: row.daily_data,
    timezone: row.timezone,
    fetchedAt: row.fetched_at,
    locationKey: row.location_key,
  };
}

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const { currentLocation } = useLocationContext();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(
    () =>
      currentLocation
        ? locationKey(currentLocation.latitude, currentLocation.longitude)
        : null,
    [currentLocation]
  );

  useEffect(() => {
    if (!key || !currentLocation) {
      setWeather(null);
      setError(null);
      return;
    }

    const latitude = currentLocation.latitude;
    const longitude = currentLocation.longitude;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadWeather() {
      const { data, error } = await supabase
        .from("weather_data")
        .select("*")
        .eq("location_key", key)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        setWeather(rowToWeather(data as WeatherDataRow));
        setLoading(false);
        return;
      }

      try {
        await fetch("/api/weather/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            latitude,
            longitude,
          }),
        });
      } catch (refreshError) {
        console.error("weather refresh failed", refreshError);
      }

      if (!cancelled) {
        setWeather(null);
        setLoading(false);
      }
    }

    loadWeather();

    const channel = supabase
      .channel(`weather-${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weather_data",
          filter: `location_key=eq.${key}`,
        },
        (payload) => {
          const row = payload.new as WeatherDataRow | null;
          if (row?.location_key) {
            setWeather(rowToWeather(row));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentLocation, key, supabase]);

  const value = useMemo<WeatherContextValue>(
    () => ({
      weather,
      loading,
      error,
      lastUpdated: weather ? new Date(weather.fetchedAt) : null,
    }),
    [error, loading, weather]
  );

  return (
    <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
  );
}

export function useWeatherContext() {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    throw new Error("useWeatherContext must be used within WeatherProvider");
  }
  return ctx;
}

export function useRelativeTime(date: Date | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.max(0, Math.round(diffMs / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
