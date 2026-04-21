"use client";

import { boundsForPoints } from "@weather/shared";
import type { Coordinate } from "@weather/shared";
import { useLocationContext } from "@/context/LocationContext";
import { useTripContext } from "@/context/TripContext";
import { useVehiclesContext } from "@/context/VehiclesContext";

function project(point: Coordinate, bounds: ReturnType<typeof boundsForPoints>) {
  const x = ((point.longitude - bounds.west) / (bounds.east - bounds.west || 1)) * 100;
  const y = 100 - ((point.latitude - bounds.south) / (bounds.north - bounds.south || 1)) * 100;
  return { x, y };
}

export default function TransitMap() {
  const { currentLocation } = useLocationContext();
  const { selectedItinerary, from, to } = useTripContext();
  const { vehicles } = useVehiclesContext();

  const routePoints = selectedItinerary?.legs.flatMap((leg) => leg.polyline) ?? [];
  const points = [
    ...(currentLocation ? [{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }] : []),
    ...(from ? [{ latitude: from.latitude, longitude: from.longitude }] : []),
    ...(to ? [{ latitude: to.latitude, longitude: to.longitude }] : []),
    ...routePoints,
    ...vehicles.map((vehicle) => ({ latitude: vehicle.latitude, longitude: vehicle.longitude })),
  ];

  const bounds =
    points.length > 1
      ? boundsForPoints(points)
      : boundsForPoints([
          { latitude: 41.88, longitude: -87.65 },
          { latitude: 41.9, longitude: -87.61 },
        ]);

  return (
    <section className="map-panel">
      <div className="map-panel__header">
        <div>
          <p className="eyebrow">Live Map</p>
          <h2>Vehicles, route geometry, and weather zone</h2>
        </div>
        <span className="map-panel__status">{vehicles.length} live vehicles</span>
      </div>
      <div className="map-surface">
        <div className="map-surface__weather" />
        <div className="map-grid" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="map-svg">
          {selectedItinerary?.legs.map((leg) => {
            const path = leg.polyline
              .map((point, index) => {
                const next = project(point, bounds);
                return `${index === 0 ? "M" : "L"} ${next.x} ${next.y}`;
              })
              .join(" ");
            return (
              <path
                key={leg.id}
                d={path}
                fill="none"
                stroke={leg.routeColor ?? (leg.mode === "walk" ? "#f8fafc" : "#60a5fa")}
                strokeDasharray={leg.mode === "walk" ? "1.6 1.6" : undefined}
                strokeLinecap="round"
                strokeWidth={leg.mode === "walk" ? 0.8 : 1.4}
              />
            );
          })}

          {vehicles.map((vehicle) => {
            const point = project(vehicle, bounds);
            return (
              <g
                key={`${vehicle.agencyId}:${vehicle.vehicleId}`}
                transform={`translate(${point.x} ${point.y})`}
              >
                <circle
                  r="1.8"
                  fill={vehicle.routeColor ?? "#60a5fa"}
                  className="map-vehicle"
                />
                <text x="2.4" y="0.8" fontSize="3" fill="white">
                  {vehicle.routeShortName ?? vehicle.mode}
                </text>
              </g>
            );
          })}

          {from ? (
            <circle {...project(from, bounds)} r="2.4" fill="#22c55e" />
          ) : null}
          {to ? (
            <rect
              x={project(to, bounds).x - 2}
              y={project(to, bounds).y - 2}
              width="4"
              height="4"
              rx="1.2"
              fill="#f97316"
            />
          ) : null}
        </svg>
      </div>
    </section>
  );
}
