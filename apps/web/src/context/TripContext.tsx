"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import type { Itinerary, PlaceSuggestion } from "@weather/shared";
import { rankItineraries } from "@/lib/ranking";
import { useWeatherContext } from "./WeatherContext";

interface TripContextValue {
  from: PlaceSuggestion | null;
  to: PlaceSuggestion | null;
  itineraries: Itinerary[];
  selectedItinerary: Itinerary | null;
  loading: boolean;
  error: string | null;
  setFrom: (place: PlaceSuggestion | null) => void;
  setTo: (place: PlaceSuggestion | null) => void;
  planTrip: (fromPlace?: PlaceSuggestion | null, toPlace?: PlaceSuggestion | null) => Promise<void>;
  selectItinerary: (itineraryId: string) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { weather } = useWeatherContext();
  const [isPending, startTransition] = useTransition();
  const [from, setFromState] = useState<PlaceSuggestion | null>(null);
  const [to, setToState] = useState<PlaceSuggestion | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setFrom = (place: PlaceSuggestion | null) => setFromState(place);
  const setTo = (place: PlaceSuggestion | null) => setToState(place);

  async function planTrip(fromPlace = from, toPlace = to) {
    if (!fromPlace || !toPlace) {
      setError("Choose a start and destination first.");
      setItineraries([]);
      return;
    }

    setError(null);

    const response = await fetch("/api/trip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: fromPlace, to: toPlace }),
    });
    const data = (await response.json()) as
      | { itineraries?: Itinerary[]; error?: string }
      | undefined;

    if (!response.ok) {
      setError(data?.error ?? "Trip planning failed.");
      setItineraries([]);
      return;
    }

    startTransition(() => {
      const ranked = rankItineraries(data?.itineraries ?? [], weather?.current ?? null);
      setItineraries(ranked);
      setSelectedId(ranked[0]?.id ?? null);
    });
  }

  const selectedItinerary = useMemo(
    () => itineraries.find((itinerary) => itinerary.id === selectedId) ?? itineraries[0] ?? null,
    [itineraries, selectedId]
  );

  const value = useMemo<TripContextValue>(
    () => ({
      from,
      to,
      itineraries,
      selectedItinerary,
      loading: isPending,
      error,
      setFrom,
      setTo,
      planTrip,
      selectItinerary: setSelectedId,
    }),
    [error, from, isPending, itineraries, selectedItinerary, to]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTripContext() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error("useTripContext must be used within TripProvider");
  }
  return context;
}
