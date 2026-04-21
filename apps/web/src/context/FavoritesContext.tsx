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
import type { PlaceSuggestion } from "@weather/shared";
import { useSupabase } from "@/lib/supabase";

export interface SavedPlace {
  id: string;
  label: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface SavedPlaceRow {
  id: string;
  label: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface FavoritesContextValue {
  favorites: SavedPlace[];
  isSignedIn: boolean;
  loading: boolean;
  isFavorite: (place: PlaceSuggestion) => boolean;
  addFavorite: (place: PlaceSuggestion) => Promise<void>;
  removeFavorite: (place: PlaceSuggestion) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function rowToSavedPlace(row: SavedPlaceRow): SavedPlace {
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function keyFor(place: { latitude: number; longitude: number }): string {
  return `${place.latitude.toFixed(5)}|${place.longitude.toFixed(5)}`;
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const { isSignedIn, userId } = useAuth();
  const [favorites, setFavorites] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setFavorites([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("saved_places")
        .select("id,label,name,address,latitude,longitude")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("favorites load failed", error);
        setFavorites([]);
        return;
      }
      setFavorites((data ?? []).map(rowToSavedPlace as (row: SavedPlaceRow) => SavedPlace));
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const favoriteKeys = useMemo(
    () => new Set(favorites.map(keyFor)),
    [favorites]
  );

  const isFavorite = useCallback(
    (place: PlaceSuggestion) => favoriteKeys.has(keyFor(place)),
    [favoriteKeys]
  );

  const addFavorite = useCallback(
    async (place: PlaceSuggestion) => {
      if (!isSignedIn || !userId) return;
      const { error } = await supabase.from("saved_places").insert({
        user_id: userId,
        label: place.label,
        name: place.name,
        address: place.label,
        kind: "custom",
        latitude: place.latitude,
        longitude: place.longitude,
        is_default_from: false,
        is_default_to: false,
      });
      if (error) {
        console.error("favorite add failed", error);
        return;
      }
      await refresh();
    },
    [isSignedIn, refresh, supabase, userId]
  );

  const removeFavorite = useCallback(
    async (place: PlaceSuggestion) => {
      if (!isSignedIn) return;
      const match = favorites.find((f) => keyFor(f) === keyFor(place));
      if (!match) return;
      const { error } = await supabase
        .from("saved_places")
        .delete()
        .eq("id", match.id);
      if (error) {
        console.error("favorite remove failed", error);
        return;
      }
      await refresh();
    },
    [favorites, isSignedIn, refresh, supabase]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      isSignedIn: Boolean(isSignedIn),
      loading,
      isFavorite,
      addFavorite,
      removeFavorite,
    }),
    [addFavorite, favorites, isFavorite, isSignedIn, loading, removeFavorite]
  );

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  );
}

export function useFavoritesContext() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavoritesContext must be used within FavoritesProvider");
  }
  return context;
}
