"use client";

import { LocationProvider } from "@/context/LocationContext";
import { TripProvider } from "@/context/TripContext";
import { VehiclesProvider } from "@/context/VehiclesContext";
import { WeatherProvider } from "@/context/WeatherContext";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocationProvider>
      <WeatherProvider>
        <VehiclesProvider>
          <TripProvider>{children}</TripProvider>
        </VehiclesProvider>
      </WeatherProvider>
    </LocationProvider>
  );
}
