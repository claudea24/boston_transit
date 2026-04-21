"use client";

import type { Itinerary } from "@weather/shared";
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

export default function ItineraryList() {
  const { itineraries, selectedItinerary, selectItinerary } = useTripContext();

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
