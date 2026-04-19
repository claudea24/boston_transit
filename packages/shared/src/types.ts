// Current weather conditions
export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  pressure: number;
  uvIndex: number;
}

// Single hour forecast
export interface HourlyForecast {
  time: string; // ISO 8601
  temperature: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  visibility: number;
  uvIndex: number;
}

// Single day forecast
export interface DailyForecast {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  feelsLikeMax: number;
  feelsLikeMin: number;
  sunrise: string;
  sunset: string;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  windGustsMax: number;
  uvIndexMax: number;
}

// Full weather data stored in Supabase JSONB columns
export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
}

// Saved location
export interface SavedLocation {
  id: string;
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  isDefault: boolean;
  displayOrder: number;
  createdAt: string;
}

// User preferences
export interface UserPreferences {
  id: string;
  userId: string;
  tempUnit: "fahrenheit" | "celsius";
  windUnit: "mph" | "kmh";
}

// Geocoding search result
export interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string; // State/province
  timezone: string;
}

// Supabase weather_data row
export interface WeatherDataRow {
  id: string;
  location_key: string;
  latitude: number;
  longitude: number;
  current_data: CurrentWeather;
  hourly_data: HourlyForecast[];
  daily_data: DailyForecast[];
  timezone: string;
  fetched_at: string;
  created_at: string;
}
