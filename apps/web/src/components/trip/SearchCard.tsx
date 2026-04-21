"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlaceSuggestion } from "@weather/shared";
import { useFavoritesContext } from "@/context/FavoritesContext";
import { useLocationContext } from "@/context/LocationContext";
import { useTripContext } from "@/context/TripContext";

type SearchField = "from" | "to";

const BOSTON_SUGGESTIONS: PlaceSuggestion[] = [
  { id: "boston-back-bay", name: "Back Bay Station", country: "United States", region: "MA", label: "Back Bay Station, Boston", latitude: 42.3474, longitude: -71.0754 },
  { id: "boston-north-station", name: "North Station", country: "United States", region: "MA", label: "North Station, Boston", latitude: 42.3663, longitude: -71.0621 },
  { id: "boston-south-station", name: "South Station", country: "United States", region: "MA", label: "South Station, Boston", latitude: 42.3519, longitude: -71.0552 },
  { id: "boston-fenway-park", name: "Fenway Park", country: "United States", region: "MA", label: "Fenway Park, Boston", latitude: 42.3467, longitude: -71.0972 },
  { id: "boston-harvard-square", name: "Harvard Square", country: "United States", region: "MA", label: "Harvard Square, Cambridge", latitude: 42.3736, longitude: -71.119 },
  { id: "boston-logan-airport", name: "Logan Airport", country: "United States", region: "MA", label: "Logan International Airport", latitude: 42.3656, longitude: -71.0096 },
];

async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  const data = (await response.json()) as { results?: PlaceSuggestion[] };
  return data.results ?? [];
}

export default function SearchCard() {
  const { currentLocation } = useLocationContext();
  const { from, to, setFrom, setTo, planTrip, loading, error } = useTripContext();
  const {
    favorites,
    isSignedIn: favSignedIn,
    isFavorite,
    addFavorite,
    removeFavorite,
  } = useFavoritesContext();
  const [activeField, setActiveField] = useState<SearchField | null>(null);
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);

  const favoritesAsSuggestions = useMemo<PlaceSuggestion[]>(
    () =>
      favorites.map((fav) => ({
        id: fav.id,
        name: fav.name,
        country: "United States",
        region: "MA",
        label: fav.label,
        latitude: fav.latitude,
        longitude: fav.longitude,
      })),
    [favorites]
  );

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
    <section className="search-card search-card--compact">
      <div className="search-card__row">
        <div className="search-grid search-grid--stacked">
          <label className="search-field search-field--row">
            <span className="search-field__pin search-field__pin--from" />
            <input
              value={fromQuery}
              onChange={(event) => {
                setFromQuery(event.target.value);
                setActiveField("from");
              }}
              onFocus={() => setActiveField("from")}
              placeholder="Choose starting point"
            />
          </label>
          <label className="search-field search-field--row">
            <span className="search-field__pin search-field__pin--to" />
            <input
              value={toQuery}
              onChange={(event) => {
                setToQuery(event.target.value);
                setActiveField("to");
              }}
              onFocus={() => setActiveField("to")}
              placeholder="Choose destination"
            />
          </label>
        </div>
        <button
          type="button"
          className="primary-button primary-button--compact"
          onClick={() => planTrip()}
          disabled={loading}
        >
          {loading ? "…" : "Directions"}
        </button>
      </div>

      {results.length > 0 && activeField ? (
        <div className="search-results">
          {results.map((result) => (
            <div key={result.id} className="search-result-row">
              <button
                type="button"
                className="search-result"
                onClick={() => choosePlace(activeField, result)}
              >
                <strong>{result.name}</strong>
                <span>{result.region ? `${result.region}, ` : ""}{result.country}</span>
              </button>
              {favSignedIn ? (
                <button
                  type="button"
                  className={`favorite-star ${isFavorite(result) ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isFavorite(result)) removeFavorite(result);
                    else addFavorite(result);
                  }}
                  title={isFavorite(result) ? "Remove from favorites" : "Save to favorites"}
                >
                  {isFavorite(result) ? "★" : "☆"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : favSignedIn && favoritesAsSuggestions.length > 0 ? (
        <div className="search-chips">
          <span className="search-chips__label">Your favorites</span>
          {favoritesAsSuggestions.map((place) => (
            <div key={place.id} className="search-chip-group">
              <button
                type="button"
                className="search-chip"
                onClick={() => choosePlace(activeField ?? "to", place)}
                title={`Use as ${activeField ?? "to"}`}
              >
                {place.name}
              </button>
              <button
                type="button"
                className="favorite-star favorite-star--chip is-active"
                onClick={(event) => {
                  event.stopPropagation();
                  removeFavorite(place);
                }}
                title="Remove from favorites"
              >
                ★
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="search-chips">
          <span className="search-chips__label">
            {favSignedIn
              ? "Star any search result to save it here"
              : "Popular in Boston"}
          </span>
          {!favSignedIn
            ? BOSTON_SUGGESTIONS.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className="search-chip"
                  onClick={() => choosePlace(activeField ?? "to", place)}
                >
                  {place.name}
                </button>
              ))
            : null}
        </div>
      )}

      {!favSignedIn ? (
        <p className="search-hint">Sign in (top-right) to save places to your favorites.</p>
      ) : null}

      {favSignedIn && (from || to) ? (
        <div className="search-favorite-actions">
          {from ? (
            <FavoriteToggle
              place={from}
              label="From"
              isFavorite={isFavorite(from)}
              onAdd={() => addFavorite(from)}
              onRemove={() => removeFavorite(from)}
            />
          ) : null}
          {to ? (
            <FavoriteToggle
              place={to}
              label="To"
              isFavorite={isFavorite(to)}
              onAdd={() => addFavorite(to)}
              onRemove={() => removeFavorite(to)}
            />
          ) : null}
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

function FavoriteToggle({
  place,
  label,
  isFavorite,
  onAdd,
  onRemove,
}: {
  place: PlaceSuggestion;
  label: string;
  isFavorite: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={`favorite-toggle ${isFavorite ? "is-active" : ""}`}
      onClick={() => (isFavorite ? onRemove() : onAdd())}
      title={isFavorite ? `Remove ${label.toLowerCase()} from favorites` : `Save ${label.toLowerCase()} to favorites`}
    >
      <span className="favorite-toggle__star">{isFavorite ? "★" : "☆"}</span>
      <span className="favorite-toggle__label">
        {label}: {place.name}
      </span>
    </button>
  );
}
