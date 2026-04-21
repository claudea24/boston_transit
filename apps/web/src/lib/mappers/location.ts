import type { SavedLocation, UserPreferences } from "@weather/shared";

type SavedLocationRow = {
  id: string;
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  is_default: boolean;
  display_order: number;
  created_at: string;
};

export function rowToSavedLocation(row: SavedLocationRow): SavedLocation {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    country: row.country,
    isDefault: row.is_default,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

type UserPreferencesRow = {
  id: string;
  user_id: string;
  temp_unit: "fahrenheit" | "celsius";
  wind_unit: "mph" | "kmh";
};

export function rowToPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    tempUnit: row.temp_unit,
    windUnit: row.wind_unit,
  };
}

export function locationKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}
