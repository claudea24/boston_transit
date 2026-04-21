"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TransitRoute } from "@/app/api/routes/route";
import { useStopsContext } from "./StopsContext";

interface RoutesContextValue {
  routes: TransitRoute[];
  stopColors: Map<string, string>;
  stopToRoutes: Map<string, TransitRoute[]>;
  routeColorById: Map<string, string>;
}

const RoutesContext = createContext<RoutesContextValue | null>(null);

export function RoutesProvider({ children }: { children: React.ReactNode }) {
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const { stops } = useStopsContext();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/routes", { cache: "default" });
        const body = (await response.json()) as { routes?: TransitRoute[] };
        if (cancelled) return;
        setRoutes(body.routes ?? []);
      } catch (error) {
        console.error("routes fetch failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedRoutes = useMemo(
    () => [...routes].sort((a, b) => a.type - b.type),
    [routes]
  );

  const { stopColors, stopToRoutes } = useMemo(() => {
    const colors = new Map<string, string>();
    const byStop = new Map<string, TransitRoute[]>();

    const addForStop = (stopId: string, route: TransitRoute) => {
      if (!colors.has(stopId)) colors.set(stopId, route.color);
      const existing = byStop.get(stopId) ?? [];
      if (!existing.includes(route)) {
        existing.push(route);
        byStop.set(stopId, existing);
      }
    };

    const parentOf = new Map<string, string>();
    for (const stop of stops) {
      if (stop.parentStation) parentOf.set(stop.id, stop.parentStation);
    }

    for (const route of sortedRoutes) {
      for (const stop of route.stops) {
        addForStop(stop.id, route);
        const parent = parentOf.get(stop.id);
        if (parent) addForStop(parent, route);
      }
    }
    return { stopColors: colors, stopToRoutes: byStop };
  }, [sortedRoutes, stops]);

  const routeColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const route of routes) map.set(route.id, route.color);
    return map;
  }, [routes]);

  const value = useMemo<RoutesContextValue>(
    () => ({ routes: sortedRoutes, stopColors, stopToRoutes, routeColorById }),
    [sortedRoutes, stopColors, stopToRoutes, routeColorById]
  );

  return <RoutesContext.Provider value={value}>{children}</RoutesContext.Provider>;
}

export function useRoutesContext() {
  const context = useContext(RoutesContext);
  if (!context) {
    throw new Error("useRoutesContext must be used within RoutesProvider");
  }
  return context;
}
