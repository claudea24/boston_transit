"use client";

import SearchCard from "@/components/trip/SearchCard";
import ItineraryList from "@/components/trip/ItineraryList";
import TransitMap from "@/components/map/TransitMap";
import WeatherPill from "@/components/weather/WeatherPill";
import { useLocationContext } from "@/context/LocationContext";

export default function DashboardPage() {
  const { loading, isDemoMode } = useLocationContext();

  if (loading) {
    return <main className="page-shell page-shell--loading">Loading dashboard...</main>;
  }

  return (
    <main className="page-shell">
      <div className="hero-grid">
        <SearchCard />
        <WeatherPill />
      </div>
      <div className="dashboard-grid">
        <TransitMap />
        <ItineraryList />
      </div>
      <section className="panel panel--compact">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Status</p>
            <h2>{isDemoMode ? "Demo city active" : "Supabase-backed profile active"}</h2>
          </div>
        </div>
        <p className="empty-copy">
          Weather is real and stored in Supabase. Transit trips and vehicle refresh prefer upstream
          providers when keys are configured and fall back to deterministic local data when they
          are not.
        </p>
      </section>
    </main>
  );
}
