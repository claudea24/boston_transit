"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface StopRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  locationType: number;
  parentStation: string | null;
}

interface StopsContextValue {
  stops: StopRecord[];
  stopsById: Map<string, StopRecord>;
  selectedStopId: string | null;
  setSelectedStopId: (id: string | null) => void;
  selectedStop: StopRecord | null;
  childStopIds: (parentId: string) => string[];
}

const StopsContext = createContext<StopsContextValue | null>(null);

export function StopsProvider({ children }: { children: React.ReactNode }) {
  const [stops, setStops] = useState<StopRecord[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/stops", { cache: "default" });
        const body = (await response.json()) as { stops?: StopRecord[] };
        if (cancelled) return;
        setStops(body.stops ?? []);
      } catch (error) {
        console.error("stops fetch failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopsById = useMemo(() => {
    const map = new Map<string, StopRecord>();
    for (const stop of stops) map.set(stop.id, stop);
    return map;
  }, [stops]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const stop of stops) {
      if (!stop.parentStation) continue;
      const children = map.get(stop.parentStation) ?? [];
      children.push(stop.id);
      map.set(stop.parentStation, children);
    }
    return map;
  }, [stops]);

  const childStopIds = useCallback(
    (parentId: string) => childrenByParent.get(parentId) ?? [],
    [childrenByParent]
  );

  const selectedStop = selectedStopId ? stopsById.get(selectedStopId) ?? null : null;

  const value = useMemo<StopsContextValue>(
    () => ({ stops, stopsById, selectedStopId, setSelectedStopId, selectedStop, childStopIds }),
    [childStopIds, selectedStop, selectedStopId, stops, stopsById]
  );

  return <StopsContext.Provider value={value}>{children}</StopsContext.Provider>;
}

export function useStopsContext() {
  const context = useContext(StopsContext);
  if (!context) {
    throw new Error("useStopsContext must be used within StopsProvider");
  }
  return context;
}
