import type { UserPreferences } from "@weather/shared";

export const defaultPreferences: Pick<UserPreferences, "tempUnit" | "windUnit"> = {
  tempUnit: "fahrenheit",
  windUnit: "mph",
};

export function formatTemp(
  fahrenheit: number,
  unit: UserPreferences["tempUnit"],
  opts: { withDegree?: boolean; digits?: number } = {}
): string {
  const { withDegree = true, digits = 0 } = opts;
  const value = unit === "celsius" ? ((fahrenheit - 32) * 5) / 9 : fahrenheit;
  return `${value.toFixed(digits)}${withDegree ? "°" : ""}`;
}

export function formatWind(
  mph: number,
  unit: UserPreferences["windUnit"]
): string {
  const value = unit === "kmh" ? mph * 1.60934 : mph;
  return `${value.toFixed(0)} ${unit === "kmh" ? "km/h" : "mph"}`;
}

const compass = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
];

export function compassDirection(deg: number): string {
  const i = Math.round(((deg % 360) / 22.5)) % 16;
  return compass[i];
}
