import { haversineMeters, interpolateLine } from "./geo.js";
import type { Coordinate, Itinerary, PlaceSuggestion, TripLeg } from "./types.js";

function isoAt(base: Date, minutesFromNow: number): string {
  return new Date(base.getTime() + minutesFromNow * 60_000).toISOString();
}

function buildLeg(
  id: string,
  mode: TripLeg["mode"],
  from: PlaceSuggestion,
  to: PlaceSuggestion,
  opts: {
    label: string;
    departOffsetMin: number;
    durationMinutes: number;
    distanceMeters: number;
    delaySeconds?: number;
    routeColor?: string;
    covered?: boolean;
    vehicleId?: string;
  }
): TripLeg {
  const now = new Date();
  const scheduledDepartureTime = isoAt(now, opts.departOffsetMin);
  const scheduledArrivalTime = isoAt(
    now,
    opts.departOffsetMin + opts.durationMinutes
  );
  const delaySeconds = opts.delaySeconds ?? 0;
  return {
    id,
    mode,
    label: opts.label,
    fromName: from.name,
    toName: to.name,
    latitude: to.latitude,
    longitude: to.longitude,
    departureTime: new Date(
      Date.parse(scheduledDepartureTime) + delaySeconds * 1000
    ).toISOString(),
    arrivalTime: new Date(
      Date.parse(scheduledArrivalTime) + delaySeconds * 1000
    ).toISOString(),
    scheduledDepartureTime,
    scheduledArrivalTime,
    delaySeconds,
    durationMinutes: opts.durationMinutes,
    distanceMeters: opts.distanceMeters,
    polyline: interpolateLine(from, to),
    routeColor: opts.routeColor,
    covered: opts.covered,
    vehicleId: opts.vehicleId,
  };
}

function minutes(meters: number, metersPerMinute: number) {
  return Math.max(1, Math.round(meters / metersPerMinute));
}

function itinerarySummary(modes: Array<TripLeg["mode"]>) {
  const visible = Array.from(new Set(modes))
    .map((mode) => mode.toUpperCase())
    .join(" + ");
  return visible || "Trip option";
}

export function buildFallbackItineraries(
  from: PlaceSuggestion,
  to: PlaceSuggestion
): Itinerary[] {
  const directDistance = haversineMeters(from, to);
  const walkMinutes = minutes(directDistance, 75);
  const itineraries: Itinerary[] = [];

  if (directDistance <= 9_000) {
    const walkLeg = buildLeg("walk-direct", "walk", from, to, {
      label: "Walk",
      departOffsetMin: 2,
      durationMinutes: walkMinutes,
      distanceMeters: directDistance,
      covered: false,
    });
    itineraries.push({
      id: "walk-direct",
      summary: "Walk straight through",
      durationMinutes: walkMinutes,
      walkingMeters: directDistance,
      waitMinutes: 0,
      transfers: 0,
      weatherScore: 0,
      modes: ["walk"],
      legs: [walkLeg],
    });
  }

  const midBusStop: PlaceSuggestion = {
    id: "bus-mid",
    name: "Central Transfer",
    country: from.country,
    label: "Central Transfer",
    latitude: from.latitude + (to.latitude - from.latitude) * 0.33 + 0.01,
    longitude: from.longitude + (to.longitude - from.longitude) * 0.33 - 0.01,
  };
  const busWalkInDistance = Math.min(450, directDistance * 0.12);
  const busWalkOutDistance = Math.min(300, directDistance * 0.08);
  const busRideDistance = Math.max(500, directDistance - busWalkInDistance - busWalkOutDistance);

  const busLegs: TripLeg[] = [
    buildLeg("bus-walk-in", "walk", from, midBusStop, {
      label: "Walk to stop",
      departOffsetMin: 1,
      durationMinutes: minutes(busWalkInDistance, 70),
      distanceMeters: busWalkInDistance,
      covered: false,
    }),
    buildLeg("bus-main", "bus", midBusStop, to, {
      label: "Route B12",
      departOffsetMin: 7,
      durationMinutes: minutes(busRideDistance, 260),
      distanceMeters: busRideDistance,
      delaySeconds: 120,
      routeColor: "#f97316",
      covered: true,
      vehicleId: "veh-b12",
    }),
  ];

  itineraries.push({
    id: "bus-express",
    summary: itinerarySummary(busLegs.map((leg) => leg.mode)),
    durationMinutes: busLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0) + 4,
    walkingMeters: busWalkInDistance,
    waitMinutes: 4,
    transfers: 0,
    weatherScore: 0,
    modes: busLegs.map((leg) => leg.mode),
    legs: busLegs,
  });

  const trainHub: PlaceSuggestion = {
    id: "train-hub",
    name: "Union Terminal",
    country: from.country,
    label: "Union Terminal",
    latitude: from.latitude + (to.latitude - from.latitude) * 0.45 - 0.012,
    longitude: from.longitude + (to.longitude - from.longitude) * 0.45 + 0.018,
  };
  const trainWalkDistance = Math.min(380, directDistance * 0.07);
  const trainRideDistance = Math.max(700, directDistance * 0.82);

  const trainLegs: TripLeg[] = [
    buildLeg("train-walk-in", "walk", from, trainHub, {
      label: "Walk to station",
      departOffsetMin: 1,
      durationMinutes: minutes(trainWalkDistance, 72),
      distanceMeters: trainWalkDistance,
      covered: true,
    }),
    buildLeg("train-main", "train", trainHub, to, {
      label: "Red Line",
      departOffsetMin: 9,
      durationMinutes: minutes(trainRideDistance, 420),
      distanceMeters: trainRideDistance,
      delaySeconds: 0,
      routeColor: "#2563eb",
      covered: true,
      vehicleId: "veh-red-line",
    }),
  ];

  itineraries.push({
    id: "train-rapid",
    summary: itinerarySummary(trainLegs.map((leg) => leg.mode)),
    durationMinutes: trainLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0) + 6,
    walkingMeters: trainWalkDistance,
    waitMinutes: 6,
    transfers: 0,
    weatherScore: 0,
    modes: trainLegs.map((leg) => leg.mode),
    legs: trainLegs,
  });

  return itineraries.sort((a, b) => a.durationMinutes - b.durationMinutes);
}
