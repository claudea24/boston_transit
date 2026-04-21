"use client";

import SearchCard from "@/components/trip/SearchCard";
import ItineraryList from "@/components/trip/ItineraryList";
import TransitMap from "@/components/map/TransitMap";
import WeatherPill from "@/components/weather/WeatherPill";
import LiveDepartures from "@/components/transit/LiveDepartures";
import { useLocationContext } from "@/context/LocationContext";
import { useTripContext } from "@/context/TripContext";
import { useVehiclesContext } from "@/context/VehiclesContext";

export default function DashboardPage() {
  const { loading } = useLocationContext();
  const { itineraries } = useTripContext();
  const { vehicles } = useVehiclesContext();

  if (loading) {
    return <main className="page-shell page-shell--loading">Loading dashboard...</main>;
  }

  return (
    <main className="map-app">
      <TransitMap />
      <div className="map-overlay map-overlay--left-stack">
        <SearchCard />
        {itineraries.length > 0 ? <ItineraryList /> : null}
      </div>
      <div className="map-overlay map-overlay--top-right">
        <WeatherPill />
      </div>
      <aside className="map-overlay map-overlay--right">
        <LiveDepartures />
      </aside>
      <div className="map-overlay map-overlay--bottom-left">
        <div className="coverage-chip">
          <span className="coverage-chip__dot" />
          MBTA Boston · {vehicles.length} live vehicles
        </div>
      </div>
    </main>
  );
}
