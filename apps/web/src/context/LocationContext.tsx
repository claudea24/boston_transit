"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/nextjs";
import type { SavedLocation, UserPreferences } from "@weather/shared";
import { useSupabase } from "@/lib/supabase";
import { defaultPreferences } from "@/lib/units";

type Prefs = Pick<UserPreferences, "tempUnit" | "windUnit">;

interface LocationContextValue {
  currentLocation: SavedLocation;
  preferences: Prefs;
  loading: boolean;
}

const BOSTON: SavedLocation = {
  id: "boston",
  userId: "default",
  name: "Boston",
  country: "United States",
  latitude: 42.3601,
  longitude: -71.0589,
  isDefault: true,
  displayOrder: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const supabase = useSupabase();
  const [preferences, setPreferences] = useState<Prefs>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn) {
      setPreferences(defaultPreferences);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("temp_unit, wind_unit")
        .maybeSingle();

      if (cancelled) return;

      if (!error && data) {
        setPreferences({ tempUnit: data.temp_unit, windUnit: data.wind_unit });
      } else {
        setPreferences(defaultPreferences);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, supabase]);

  const value = useMemo<LocationContextValue>(
    () => ({ currentLocation: BOSTON, preferences, loading }),
    [preferences, loading]
  );

  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
}

export function useLocationContext() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocationContext must be used within LocationProvider");
  }
  return context;
}
