import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { StopPrediction } from "./types.js";

const MBTA_TRIP_UPDATES_URL = "https://cdn.mbta.com/realtime/TripUpdates.pb";
const MBTA_AGENCY_ID = "o-drt-massbayareatransportationauthority";

function toIsoTimestamp(timestamp?: Long | number | null): string | undefined {
  if (timestamp == null) return undefined;
  const seconds =
    typeof timestamp === "number" ? timestamp : Number(timestamp.toString());
  if (!Number.isFinite(seconds) || seconds === 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function toDelaySeconds(delay?: number | null): number | undefined {
  return typeof delay === "number" ? delay : undefined;
}

async function fetchTripUpdatesBinary(attempts = 3): Promise<Uint8Array> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(MBTA_TRIP_UPDATES_URL, {
        cache: "no-store",
        headers: {
          "user-agent": "boston-transit/1.0 (+github.com/claudea24/boston_transit)",
          accept: "application/octet-stream",
        },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `MBTA TripUpdates request failed: ${response.status} ${response.statusText} - ${body.slice(0, 200)}`
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MBTA TripUpdates fetch failed");
}

export async function fetchMbtaTripUpdates(): Promise<StopPrediction[]> {
  const binary = await fetchTripUpdatesBinary();
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(binary) as {
    entity?: Array<{
      tripUpdate?: {
        trip?: {
          tripId?: string | null;
          routeId?: string | null;
        } | null;
        vehicle?: { id?: string | null } | null;
        stopTimeUpdate?: Array<{
          stopSequence?: number | null;
          stopId?: string | null;
          arrival?: { time?: Long | number | null; delay?: number | null } | null;
          departure?: { time?: Long | number | null; delay?: number | null } | null;
        }> | null;
      } | null;
    }>;
  };

  const now = new Date().toISOString();
  const predictions: StopPrediction[] = [];

  for (const entity of message.entity ?? []) {
    const tripUpdate = entity.tripUpdate;
    const tripId = tripUpdate?.trip?.tripId;
    const routeId = tripUpdate?.trip?.routeId ?? undefined;
    const vehicleId = tripUpdate?.vehicle?.id ?? undefined;
    const stopTimeUpdates = tripUpdate?.stopTimeUpdate ?? [];
    if (!tripId) continue;

    for (const stu of stopTimeUpdates) {
      const stopId = stu.stopId;
      if (!stopId) continue;

      const predictedArrival = toIsoTimestamp(stu.arrival?.time);
      const predictedDeparture = toIsoTimestamp(stu.departure?.time);
      if (!predictedArrival && !predictedDeparture) continue;

      const delaySeconds =
        toDelaySeconds(stu.arrival?.delay) ?? toDelaySeconds(stu.departure?.delay);

      predictions.push({
        agencyId: MBTA_AGENCY_ID,
        tripId,
        routeId,
        routeShortName: routeId,
        stopId,
        stopSequence: stu.stopSequence ?? undefined,
        predictedArrival,
        predictedDeparture,
        delaySeconds,
        vehicleId,
        updatedAt: now,
      });
    }
  }

  return predictions;
}
