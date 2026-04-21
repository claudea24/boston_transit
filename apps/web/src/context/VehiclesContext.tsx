"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { VehiclePosition, VehiclePositionRow } from "@weather/shared";
import { bboxAroundPoint } from "@weather/shared";
import { useSupabase } from "@/lib/supabase";
import { rowToVehicle } from "@/lib/mappers/vehicle";
import { useLocationContext } from "./LocationContext";

interface VehiclesContextValue {
  vehicles: VehiclePosition[];
  loading: boolean;
}

const VehiclesContext = createContext<VehiclesContextValue | null>(null);

export function VehiclesProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const { currentLocation } = useLocationContext();
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [loading, setLoading] = useState(false);
  const bounds = useMemo(
    () =>
      currentLocation
        ? bboxAroundPoint(currentLocation.latitude, currentLocation.longitude)
        : null,
    [currentLocation]
  );

  useEffect(() => {
    if (!bounds || !currentLocation) {
      setVehicles([]);
      return;
    }

    const currentBounds = bounds;
    const latitude = currentLocation.latitude;
    const longitude = currentLocation.longitude;
    let cancelled = false;
    setLoading(true);

    async function queryVehicles() {
      const { data, error } = await supabase
        .from("vehicle_positions")
        .select("*")
        .gte("latitude", currentBounds.south)
        .lte("latitude", currentBounds.north)
        .gte("longitude", currentBounds.west)
        .lte("longitude", currentBounds.east)
        .order("updated_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("loadVehicles failed", error);
        return;
      }

      const rows = (data ?? []) as VehiclePositionRow[];
      setVehicles(rows.map(rowToVehicle));
    }

    async function loadVehicles() {
      await queryVehicles();
      if (!cancelled) setLoading(false);
    }

    loadVehicles();

    const channel = supabase
      .channel(`vehicles-live-${latitude.toFixed(2)}-${longitude.toFixed(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_positions",
        },
        () => {
          queryVehicles().catch((error) => {
            console.error("refresh vehicles subscription failed", error);
          });
        }
      )
      .subscribe();

    const pollTimer = setInterval(() => {
      if (cancelled) return;
      queryVehicles().catch((error) =>
        console.error("vehicles poll requery failed", error)
      );
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [bounds, currentLocation, supabase]);

  const value = useMemo(
    () => ({ vehicles, loading }),
    [loading, vehicles]
  );

  return (
    <VehiclesContext.Provider value={value}>
      {children}
    </VehiclesContext.Provider>
  );
}

export function useVehiclesContext() {
  const context = useContext(VehiclesContext);
  if (!context) {
    throw new Error("useVehiclesContext must be used within VehiclesProvider");
  }
  return context;
}
