import type { Itinerary } from "@weather/shared";
import type { TransitRoute } from "@/app/api/routes/route";

function normalize(color: string | undefined | null): string {
  return (color ?? "").trim().toLowerCase().replace(/^#/, "");
}

export function tripRouteIdSet(
  itinerary: Itinerary | null,
  routes: TransitRoute[]
): Set<string> {
  const set = new Set<string>();
  if (!itinerary) return set;

  const legColors = new Set<string>();
  for (const leg of itinerary.legs) {
    const c = normalize(leg.routeColor);
    if (c) legColors.add(c);
  }
  if (legColors.size === 0) return set;

  for (const route of routes) {
    if (legColors.has(normalize(route.color))) set.add(route.id);
  }
  return set;
}
