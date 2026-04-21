"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/nextjs";
import type { SavedLocation, UserPreferences } from "@weather/shared";
import { useSupabase } from "@/lib/supabase";
import {
  rowToPreferences,
  rowToSavedLocation,
} from "@/lib/mappers/location";
import { defaultPreferences } from "@/lib/units";

type Prefs = Pick<UserPreferences, "tempUnit" | "windUnit">;

type AddLocationInput = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};

interface LocationContextValue {
  locations: SavedLocation[];
  currentLocation: SavedLocation | null;
  preferences: Prefs;
  loading: boolean;
  isDemoMode: boolean;
  selectLocation: (id: string) => void;
  addLocation: (loc: AddLocationInput) => Promise<SavedLocation | null>;
  removeLocation: (id: string) => Promise<void>;
  setDefaultLocation: (id: string) => Promise<void>;
  updatePreferences: (next: Partial<Prefs>) => Promise<void>;
}

const DEMO_LOCATION: SavedLocation = {
  id: "demo-chicago",
  userId: "demo",
  name: "Chicago",
  country: "United States",
  latitude: 41.8781,
  longitude: -87.6298,
  isDefault: true,
  displayOrder: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const supabase = useSupabase();

  const [locations, setLocations] = useState<SavedLocation[]>([DEMO_LOCATION]);
  const [selectedId, setSelectedId] = useState<string>(DEMO_LOCATION.id);
  const [preferences, setPreferences] = useState<Prefs>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setLocations([DEMO_LOCATION]);
      setSelectedId(DEMO_LOCATION.id);
      setPreferences(defaultPreferences);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      const [locsRes, prefsRes] = await Promise.all([
        supabase
          .from("saved_locations")
          .select("*")
          .order("display_order", { ascending: true }),
        supabase.from("user_preferences").select("*").maybeSingle(),
      ]);

      if (cancelled) return;

      const mapped = (locsRes.data ?? []).map(rowToSavedLocation);
      const nextLocations = mapped.length > 0 ? mapped : [DEMO_LOCATION];
      setLocations(nextLocations);
      setSelectedId((prev) => {
        if (nextLocations.some((location) => location.id === prev)) return prev;
        return nextLocations.find((location) => location.isDefault)?.id ?? nextLocations[0].id;
      });

      if (!prefsRes.error && prefsRes.data) {
        setPreferences(rowToPreferences(prefsRes.data));
      } else {
        setPreferences(defaultPreferences);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, supabase, userId]);

  const currentLocation = useMemo(
    () => locations.find((location) => location.id === selectedId) ?? locations[0] ?? null,
    [locations, selectedId]
  );

  const selectLocation = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const addLocation = useCallback<LocationContextValue["addLocation"]>(
    async (loc) => {
      if (!userId) {
        const demoLocation: SavedLocation = {
          id: `demo-${loc.latitude.toFixed(2)}-${loc.longitude.toFixed(2)}`,
          userId: "demo",
          name: loc.name,
          country: loc.country,
          latitude: loc.latitude,
          longitude: loc.longitude,
          isDefault: false,
          displayOrder: locations.length,
          createdAt: new Date().toISOString(),
        };
        setLocations((prev) => [...prev, demoLocation]);
        setSelectedId(demoLocation.id);
        return demoLocation;
      }

      const isFirst = locations.length === 0;
      const { data, error } = await supabase
        .from("saved_locations")
        .insert({
          user_id: userId,
          name: loc.name,
          country: loc.country,
          latitude: loc.latitude,
          longitude: loc.longitude,
          is_default: isFirst,
          display_order: locations.length,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("addLocation failed", error);
        return null;
      }

      const mapped = rowToSavedLocation(data);
      setLocations((prev) => [...prev, mapped]);
      setSelectedId(mapped.id);
      return mapped;
    },
    [locations.length, supabase, userId]
  );

  const removeLocation = useCallback(
    async (id: string) => {
      if (!userId) {
        setLocations((prev) => prev.filter((location) => location.id !== id));
        if (selectedId === id) setSelectedId(DEMO_LOCATION.id);
        return;
      }

      const { error } = await supabase.from("saved_locations").delete().eq("id", id);
      if (error) {
        console.error("removeLocation failed", error);
        return;
      }
      setLocations((prev) => prev.filter((location) => location.id !== id));
      setSelectedId((prev) => (prev === id ? DEMO_LOCATION.id : prev));
    },
    [selectedId, supabase, userId]
  );

  const setDefaultLocation = useCallback(
    async (id: string) => {
      if (!userId) {
        setLocations((prev) =>
          prev.map((location) => ({ ...location, isDefault: location.id === id }))
        );
        setSelectedId(id);
        return;
      }

      const { error: clearErr } = await supabase
        .from("saved_locations")
        .update({ is_default: false })
        .eq("user_id", userId);
      if (clearErr) {
        console.error("clear defaults failed", clearErr);
        return;
      }

      const { error: setErr } = await supabase
        .from("saved_locations")
        .update({ is_default: true })
        .eq("id", id);
      if (setErr) {
        console.error("set default failed", setErr);
        return;
      }

      setLocations((prev) =>
        prev.map((location) => ({ ...location, isDefault: location.id === id }))
      );
      setSelectedId(id);
    },
    [supabase, userId]
  );

  const updatePreferences = useCallback(
    async (next: Partial<Prefs>) => {
      const merged = { ...preferences, ...next };
      setPreferences(merged);
      if (!userId) return;

      const { error } = await supabase.from("user_preferences").upsert(
        {
          user_id: userId,
          temp_unit: merged.tempUnit,
          wind_unit: merged.windUnit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) console.error("updatePreferences failed", error);
    },
    [preferences, supabase, userId]
  );

  const value = useMemo<LocationContextValue>(
    () => ({
      locations,
      currentLocation,
      preferences,
      loading,
      isDemoMode: !isSignedIn,
      selectLocation,
      addLocation,
      removeLocation,
      setDefaultLocation,
      updatePreferences,
    }),
    [
      addLocation,
      currentLocation,
      isSignedIn,
      loading,
      locations,
      preferences,
      removeLocation,
      selectLocation,
      setDefaultLocation,
      updatePreferences,
    ]
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
