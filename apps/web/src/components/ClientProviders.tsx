"use client";

import { FavoritesProvider } from "@/context/FavoritesContext";
import { LocationProvider } from "@/context/LocationContext";
import { PredictionsProvider } from "@/context/PredictionsContext";
import { RoutesProvider } from "@/context/RoutesContext";
import { StopsProvider } from "@/context/StopsContext";
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
          <PredictionsProvider>
            <StopsProvider>
              <RoutesProvider>
                <FavoritesProvider>
                  <TripProvider>{children}</TripProvider>
                </FavoritesProvider>
              </RoutesProvider>
            </StopsProvider>
          </PredictionsProvider>
        </VehiclesProvider>
      </WeatherProvider>
    </LocationProvider>
  );
}
