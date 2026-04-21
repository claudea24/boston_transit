"use client";

import { useEffect, useMemo, useState } from "react";
import type { StopPrediction } from "@weather/shared";
import { usePredictionsContext } from "@/context/PredictionsContext";
import { useRoutesContext } from "@/context/RoutesContext";
import { useStopsContext } from "@/context/StopsContext";
import { useVehiclesContext } from "@/context/VehiclesContext";
import { estimateEtaForStop } from "@/lib/estimateEta";

const ROUTE_COLORS: Record<string, string> = {
  Red: "#da291c",
  Blue: "#003da5",
  Orange: "#ed8b00",
  "Green-B": "#00843d",
  "Green-C": "#00843d",
  "Green-D": "#00843d",
  "Green-E": "#00843d",
  Mattapan: "#da291c",
};

function colorFor(routeId: string | undefined): string {
  if (!routeId) return "#64748b";
  if (ROUTE_COLORS[routeId]) return ROUTE_COLORS[routeId];
  if (routeId.startsWith("CR-")) return "#80276c";
  if (routeId.startsWith("Boat-")) return "#008eaa";
  return "#ffc72c";
}

function formatEta(targetIso: string | undefined, now: number): string {
  if (!targetIso) return "";
  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= -30_000) return "";
  if (diffMs <= 30_000) return "now";
  const mins = Math.round(diffMs / 60_000);
  if (mins <= 0) return "now";
  if (mins === 1) return "in 1 min";
  return `in ${mins} min`;
}

export default function LiveDepartures() {
  const { predictionsForStops, requestStops, loading } = usePredictionsContext();
  const { selectedStop, selectedStopId, setSelectedStopId, childStopIds } = useStopsContext();
  const { stopToRoutes } = useRoutesContext();
  const { vehicles } = useVehiclesContext();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const stopIds = useMemo(() => {
    if (!selectedStopId) return [] as string[];
    return [selectedStopId, ...childStopIds(selectedStopId)];
  }, [selectedStopId, childStopIds]);

  useEffect(() => {
    if (stopIds.length > 0) requestStops(stopIds);
  }, [stopIds, requestStops]);

  const connectedRoutes = useMemo(() => {
    if (!selectedStopId) return [];
    const seen = new Map<string, { id: string; shortName: string; color: string; textColor: string }>();
    const ids = [selectedStopId, ...childStopIds(selectedStopId)];
    for (const id of ids) {
      for (const route of stopToRoutes.get(id) ?? []) {
        if (!seen.has(route.id)) {
          seen.set(route.id, {
            id: route.id,
            shortName: route.shortName,
            color: route.color,
            textColor: route.textColor,
          });
        }
      }
    }
    return [...seen.values()];
  }, [selectedStopId, childStopIds, stopToRoutes]);

  const upcoming = useMemo(() => {
    if (stopIds.length === 0) return [] as StopPrediction[];
    const thirtyMin = now + 30 * 60_000;
    return predictionsForStops(stopIds)
      .filter((p): p is StopPrediction & { predictedArrival: string } =>
        Boolean(p.predictedArrival)
      )
      .filter((p) => {
        const t = new Date(p.predictedArrival).getTime();
        return t > now - 60_000 && t < thirtyMin;
      })
      .sort(
        (a, b) =>
          new Date(a.predictedArrival).getTime() - new Date(b.predictedArrival).getTime()
      )
      .slice(0, 8);
  }, [predictionsForStops, stopIds, now]);

  const estimatedEtas = useMemo(() => {
    if (!selectedStop || upcoming.length > 0) return [];
    const routeIds = new Set(connectedRoutes.map((r) => r.id));
    if (routeIds.size === 0) return [];
    return estimateEtaForStop(selectedStop, vehicles, routeIds);
  }, [selectedStop, upcoming.length, connectedRoutes, vehicles]);

  if (!selectedStop) return null;

  return (
    <section className="live-departures">
      <div className="live-departures__header">
        <div className="live-departures__title">
          <span className="eyebrow">Next arrivals</span>
          <h3>{selectedStop.name}</h3>
        </div>
        <button
          type="button"
          className="live-departures__close"
          aria-label="Close"
          onClick={() => setSelectedStopId(null)}
        >
          ×
        </button>
      </div>
      {connectedRoutes.length > 0 ? (
        <div className="live-departures__routes">
          {connectedRoutes.map((route) => (
            <span
              key={route.id}
              className="route-pill"
              style={{ backgroundColor: route.color, color: route.textColor }}
              title={route.id}
            >
              {route.shortName}
            </span>
          ))}
        </div>
      ) : null}
      {loading && upcoming.length === 0 && estimatedEtas.length === 0 ? (
        <p className="live-departures__empty">Loading predictions...</p>
      ) : upcoming.length === 0 && estimatedEtas.length === 0 ? (
        <p className="live-departures__empty">
          No arrivals predicted in the next 30 minutes at this stop.
        </p>
      ) : upcoming.length > 0 ? (
        <ul className="live-departures__list">
          {upcoming.map((p) => {
            const eta = formatEta(p.predictedArrival, now);
            if (!eta) return null;
            return (
              <li key={`${p.tripId}:${p.stopId}`} className="live-departure">
                <span
                  className="route-pill"
                  style={{ backgroundColor: colorFor(p.routeId) }}
                >
                  {p.routeShortName ?? p.routeId ?? "—"}
                </span>
                <span className="live-departure__stop">
                  {p.delaySeconds != null && Math.abs(p.delaySeconds) < 60
                    ? "On time"
                    : p.delaySeconds != null && p.delaySeconds > 60
                      ? `+${Math.round(p.delaySeconds / 60)} min late`
                      : "Scheduled"}
                </span>
                <span className="live-departure__eta">{eta}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <p className="live-departures__estimated-label">
            MBTA predictions unavailable — estimated from live vehicle positions
          </p>
          <ul className="live-departures__list">
            {estimatedEtas.map((est) => {
              const mins = Math.max(1, Math.round(est.etaMs / 60_000));
              return (
                <li
                  key={`est:${est.vehicleId}:${est.routeId}`}
                  className="live-departure live-departure--estimated"
                >
                  <span
                    className="route-pill"
                    style={{ backgroundColor: colorFor(est.routeId) }}
                  >
                    {est.routeShortName ?? est.routeId ?? "—"}
                  </span>
                  <span className="live-departure__stop">
                    ~{Math.round(est.distanceMeters / 100) / 10} km away
                  </span>
                  <span className="live-departure__eta">~{mins} min</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
