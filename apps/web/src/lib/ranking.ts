import type { CurrentWeather, Itinerary } from "@weather/shared";

function isRainy(code: number) {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
}

function isSnowy(code: number) {
  return [71, 73, 75, 77, 85, 86].includes(code);
}

export function rankItineraries(
  itineraries: Itinerary[],
  weather: CurrentWeather | null
): Itinerary[] {
  return [...itineraries]
    .map((itinerary) => {
      let score = itinerary.durationMinutes * 1.2 + itinerary.waitMinutes * 1.8;
      score += itinerary.walkingMeters / 140;
      if (weather) {
        if (isRainy(weather.weatherCode)) {
          score += itinerary.walkingMeters > 400 ? 14 : 4;
          if (itinerary.legs.some((leg) => leg.mode !== "walk" && leg.covered)) {
            score -= 10;
          }
        }
        if (isSnowy(weather.weatherCode)) {
          score += itinerary.waitMinutes > 8 ? 8 : 2;
          if (itinerary.modes.includes("train")) {
            score -= 6;
          }
        }
        if (!isRainy(weather.weatherCode) && !isSnowy(weather.weatherCode)) {
          if (itinerary.modes.length === 1 && itinerary.modes[0] === "walk") {
            score -= 6;
          }
        }
      }
      return { ...itinerary, weatherScore: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => a.weatherScore - b.weatherScore);
}
