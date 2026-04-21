"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlaceSuggestion } from "@weather/shared";
import { useLocationContext } from "@/context/LocationContext";
import { useTripContext } from "@/context/TripContext";

type SearchField = "from" | "to";

async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  const data = (await response.json()) as { results?: PlaceSuggestion[] };
  return data.results ?? [];
}

export default function SearchCard() {
  const { currentLocation } = useLocationContext();
  const { from, to, setFrom, setTo, planTrip, loading, error } = useTripContext();
  const [activeField, setActiveField] = useState<SearchField | null>(null);
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);

  useEffect(() => {
    if (!currentLocation) return;
    if (from) return;
    setFrom({
      id: currentLocation.id,
      name: currentLocation.name,
      country: currentLocation.country,
      label: `${currentLocation.name}, ${currentLocation.country}`,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    });
    setFromQuery(currentLocation.name);
  }, [currentLocation, from, setFrom]);

  useEffect(() => {
    const query = activeField === "from" ? fromQuery : activeField === "to" ? toQuery : "";
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchPlaces(query).then(setResults).catch((searchError) => {
        console.error("place search failed", searchError);
        setResults([]);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [activeField, fromQuery, toQuery]);

  const selectedSummary = useMemo(
    () => ({
      from: from?.label ?? fromQuery ?? "From",
      to: to?.label ?? toQuery ?? "To",
    }),
    [from, fromQuery, to, toQuery]
  );

  function choosePlace(field: SearchField, place: PlaceSuggestion) {
    if (field === "from") {
      setFrom(place);
      setFromQuery(place.label);
    } else {
      setTo(place);
      setToQuery(place.label);
    }
    setResults([]);
    setActiveField(null);
  }

  return (
    <section className="search-card">
      <div className="search-card__header">
        <div>
          <p className="eyebrow">Live Transit + Weather</p>
          <h1>Plan around weather, not just distance.</h1>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => planTrip()}
          disabled={loading}
        >
          {loading ? "Planning..." : "Find routes"}
        </button>
      </div>

      <div className="search-grid">
        <label className="search-field">
          <span>From</span>
          <input
            value={fromQuery}
            onChange={(event) => {
              setFromQuery(event.target.value);
              setActiveField("from");
            }}
            onFocus={() => setActiveField("from")}
            placeholder="Union Station"
          />
        </label>
        <label className="search-field">
          <span>To</span>
          <input
            value={toQuery}
            onChange={(event) => {
              setToQuery(event.target.value);
              setActiveField("to");
            }}
            onFocus={() => setActiveField("to")}
            placeholder="Museum Campus"
          />
        </label>
      </div>

      {results.length > 0 && activeField ? (
        <div className="search-results">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="search-result"
              onClick={() => choosePlace(activeField, result)}
            >
              <strong>{result.name}</strong>
              <span>{result.region ? `${result.region}, ` : ""}{result.country}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="search-card__footer">
        <p>
          <span className="muted-label">Active</span>
          {selectedSummary.from} to {selectedSummary.to}
        </p>
        {error ? <p className="status-error">{error}</p> : null}
      </div>
    </section>
  );
}
