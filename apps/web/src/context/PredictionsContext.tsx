"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StopPrediction, StopPredictionRow } from "@weather/shared";
import { useSupabase } from "@/lib/supabase";

interface PredictionsContextValue {
  predictionsForStops: (stopIds: string[]) => StopPrediction[];
  requestStops: (stopIds: string[]) => void;
  loading: boolean;
}

const PredictionsContext = createContext<PredictionsContextValue | null>(null);

function rowToPrediction(row: StopPredictionRow): StopPrediction {
  return {
    agencyId: row.agency_id,
    tripId: row.trip_id,
    routeId: row.route_id ?? undefined,
    routeShortName: row.route_short_name ?? undefined,
    stopId: row.stop_id,
    stopSequence: row.stop_sequence ?? undefined,
    predictedArrival: row.predicted_arrival ?? undefined,
    predictedDeparture: row.predicted_departure ?? undefined,
    delaySeconds: row.delay_seconds ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

type SupabaseClient = ReturnType<typeof useSupabase>;

async function fetchForStops(
  supabase: SupabaseClient,
  stopIds: string[]
): Promise<StopPrediction[]> {
  if (stopIds.length === 0) return [];
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await supabase
    .from("stop_predictions")
    .select("*")
    .in("stop_id", stopIds)
    .gte("predicted_arrival", cutoff)
    .order("predicted_arrival", { ascending: true })
    .limit(200);

  if (error) {
    console.error("fetchForStops failed", error);
    return [];
  }
  return ((data ?? []) as StopPredictionRow[]).map(rowToPrediction);
}

export function PredictionsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const [byStop, setByStop] = useState<Map<string, StopPrediction[]>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const trackedStopsRef = useRef<Set<string>>(new Set());

  const requestStops = useCallback(
    (stopIds: string[]) => {
      if (stopIds.length === 0) return;
      const tracked = trackedStopsRef.current;
      const newIds = stopIds.filter((id) => !tracked.has(id));
      for (const id of stopIds) tracked.add(id);
      if (newIds.length === 0) return;

      setLoading(true);
      fetchForStops(supabase, newIds)
        .then((predictions) => {
          setByStop((prev) => {
            const next = new Map(prev);
            const grouped = new Map<string, StopPrediction[]>();
            for (const id of newIds) grouped.set(id, []);
            for (const p of predictions) {
              const list = grouped.get(p.stopId) ?? [];
              list.push(p);
              grouped.set(p.stopId, list);
            }
            for (const [id, list] of grouped) next.set(id, list);
            return next;
          });
        })
        .finally(() => setLoading(false));
    },
    [supabase]
  );

  const predictionsForStops = useCallback(
    (stopIds: string[]) => {
      const result: StopPrediction[] = [];
      for (const id of stopIds) {
        const list = byStop.get(id);
        if (list) result.push(...list);
      }
      return result;
    },
    [byStop]
  );

  useEffect(() => {
    const channel = supabase
      .channel("stop-predictions-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stop_predictions" },
        (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const changedStopId =
            (payload.new?.stop_id as string | undefined) ??
            (payload.old?.stop_id as string | undefined);
          if (!changedStopId) return;
          if (!trackedStopsRef.current.has(changedStopId)) return;
          fetchForStops(supabase, [changedStopId]).then((preds) => {
            setByStop((prev) => {
              const next = new Map(prev);
              next.set(changedStopId, preds);
              return next;
            });
          });
        }
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          console.log("[realtime] stop_predictions SUBSCRIBED");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[realtime] stop_predictions ${status}`, error);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const timer = setInterval(() => {
      const tracked = [...trackedStopsRef.current];
      if (tracked.length === 0) return;
      fetchForStops(supabase, tracked).then((predictions) => {
        setByStop((prev) => {
          const next = new Map(prev);
          const grouped = new Map<string, StopPrediction[]>();
          for (const id of tracked) grouped.set(id, []);
          for (const p of predictions) {
            const list = grouped.get(p.stopId) ?? [];
            list.push(p);
            grouped.set(p.stopId, list);
          }
          for (const [id, list] of grouped) next.set(id, list);
          return next;
        });
      });
    }, 10_000);
    return () => clearInterval(timer);
  }, [supabase]);

  const value = useMemo<PredictionsContextValue>(
    () => ({ predictionsForStops, requestStops, loading }),
    [loading, predictionsForStops, requestStops]
  );

  return (
    <PredictionsContext.Provider value={value}>
      {children}
    </PredictionsContext.Provider>
  );
}

export function usePredictionsContext() {
  const context = useContext(PredictionsContext);
  if (!context) {
    throw new Error("usePredictionsContext must be used within PredictionsProvider");
  }
  return context;
}
