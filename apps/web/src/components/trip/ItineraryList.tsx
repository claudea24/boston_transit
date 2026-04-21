"use client";

import { useEffect, useState } from "react";
import type { Itinerary, TripLeg } from "@weather/shared";
import { useTripContext } from "@/context/TripContext";

function delayLabel(delaySeconds: number) {
  const delayMinutes = Math.round(delaySeconds / 60);
  if (Math.abs(delayMinutes) < 1) return "On time";
  if (delayMinutes > 0) return `+${delayMinutes} min`;
  return `${delayMinutes} min`;
}

function delayClass(delaySeconds: number) {
  const abs = Math.abs(delaySeconds);
  if (abs < 60) return "delay delay--good";
  if (abs <= 300) return "delay delay--warn";
  return "delay delay--bad";
}

function firstTransitLeg(itinerary: Itinerary): TripLeg | null {
  return itinerary.legs.find((leg) => leg.mode !== "walk") ?? null;
}

function walkMinutesBefore(itinerary: Itinerary, transitLeg: TripLeg): number {
  let total = 0;
  for (const leg of itinerary.legs) {
    if (leg === transitLeg) break;
    if (leg.mode === "walk") total += leg.durationMinutes;
  }
  return total;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function leaveCue(itinerary: Itinerary, now: number): string | null {
  const transit = firstTransitLeg(itinerary);
  if (!transit) return null;
  const walkMin = walkMinutesBefore(itinerary, transit);
  const departure = new Date(transit.departureTime).getTime();
  const leaveAt = departure - walkMin * 60_000;
  const leaveInMin = Math.round((leaveAt - now) / 60_000);
  const clock = formatClock(transit.departureTime);
  if (leaveInMin <= 0) {
    return `Leave now — ${transit.label} departs at ${clock}`;
  }
  if (leaveInMin === 1) {
    return `Leave in 1 min to catch ${transit.label} at ${clock}`;
  }
  if (leaveInMin > 90) return null;
  return `Leave in ${leaveInMin} min to catch ${transit.label} at ${clock}`;
}

export default function ItineraryList() {
  const { itineraries, selectedItinerary, selectItinerary } = useTripContext();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (itineraries.length === 0) {
    return (
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Trip Options</p>
            <h2>No route yet</h2>
          </div>
        </div>
        <p className="empty-copy">
          Choose two places and request a route. Covered transit options will rise when current
          weather is rough.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Trip Options</p>
          <h2>{itineraries.length} routes ranked for current conditions</h2>
        </div>
      </div>
      <div className="itinerary-list">
        {itineraries.map((itinerary: Itinerary) => {
          const active = selectedItinerary?.id === itinerary.id;
          const cue = leaveCue(itinerary, now);
          return (
            <button
              key={itinerary.id}
              type="button"
              className={`itinerary-card ${active ? "is-active" : ""}`}
              onClick={() => selectItinerary(itinerary.id)}
            >
              <div className="itinerary-card__top">
                <div>
                  <strong>{itinerary.summary}</strong>
                  <p>
                    {itinerary.durationMinutes} min · {Math.round(itinerary.walkingMeters)} m walk
                  </p>
                </div>
                <span className="score-chip">score {itinerary.weatherScore}</span>
              </div>
              {cue ? <p className="leave-cue">{cue}</p> : null}
              <div className="mode-row">
                {itinerary.legs.map((leg) => (
                  <span key={leg.id} className={`mode-pill mode-pill--${leg.mode}`}>
                    {leg.mode}
                  </span>
                ))}
              </div>
              <div className="leg-stack">
                {itinerary.legs.map((leg) => (
                  <div key={leg.id} className="leg-row">
                    <div>
                      <strong>{leg.label}</strong>
                      <p>{leg.fromName} to {leg.toName}</p>
                    </div>
                    <span className={delayClass(leg.delaySeconds)}>{delayLabel(leg.delaySeconds)}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
