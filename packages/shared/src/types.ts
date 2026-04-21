export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface PlaceSuggestion extends Coordinate {
  id: string;
  name: string;
  country: string;
  region?: string;
  label: string;
  timezone?: string;
}

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

export interface HourlyForecast {
  time: string;
  temperature: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  visibility: number;
  uvIndex: number;
}

export interface DailyForecast {
  date: string;
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

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
}

export interface SavedLocation extends Coordinate {
  id: string;
  userId: string;
  name: string;
  country: string;
  isDefault: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface UserPreferences {
  id: string;
  userId: string;
  tempUnit: "fahrenheit" | "celsius";
  windUnit: "mph" | "kmh";
}

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

export type VehicleMode =
  | "bus"
  | "rail"
  | "tram"
  | "ferry"
  | "cable_car"
  | "other";

export interface VehiclePosition extends Coordinate {
  agencyId: string;
  vehicleId: string;
  routeId?: string;
  tripId?: string;
  routeShortName?: string;
  routeColor?: string;
  headsign?: string;
  mode: VehicleMode;
  bearing?: number;
  speedKmh?: number;
  delaySeconds?: number;
  stopSequence?: number;
  updatedAt: string;
}

export interface VehiclePositionRow {
  id: string;
  agency_id: string;
  vehicle_id: string;
  route_id: string | null;
  route_short_name: string | null;
  route_color: string | null;
  trip_id: string | null;
  headsign: string | null;
  mode: VehicleMode;
  latitude: number;
  longitude: number;
  bearing: number | null;
  speed_kmh: number | null;
  delay_seconds: number | null;
  stop_sequence: number | null;
  updated_at: string;
  created_at: string;
}

export interface TripLeg extends Coordinate {
  id: string;
  mode: "walk" | "bus" | "train" | "tram";
  label: string;
  fromName: string;
  toName: string;
  departureTime: string;
  arrivalTime: string;
  scheduledDepartureTime: string;
  scheduledArrivalTime: string;
  delaySeconds: number;
  durationMinutes: number;
  distanceMeters: number;
  polyline: Coordinate[];
  routeColor?: string;
  vehicleId?: string;
  covered?: boolean;
}

export interface Itinerary {
  id: string;
  summary: string;
  durationMinutes: number;
  walkingMeters: number;
  waitMinutes: number;
  transfers: number;
  weatherScore: number;
  modes: Array<TripLeg["mode"]>;
  legs: TripLeg[];
}

export interface TripPlanResponse {
  itineraries: Itinerary[];
  source: "here" | "fallback";
}

export interface GeocodingResult extends Coordinate {
  name: string;
  country: string;
  admin1?: string;
  timezone: string;
}

export interface StopPrediction {
  agencyId: string;
  tripId: string;
  routeId?: string;
  routeShortName?: string;
  stopId: string;
  stopSequence?: number;
  predictedArrival?: string;
  predictedDeparture?: string;
  delaySeconds?: number;
  vehicleId?: string;
  updatedAt: string;
}

export interface StopPredictionRow {
  id: string;
  agency_id: string;
  trip_id: string;
  route_id: string | null;
  route_short_name: string | null;
  stop_id: string;
  stop_sequence: number | null;
  predicted_arrival: string | null;
  predicted_departure: string | null;
  delay_seconds: number | null;
  vehicle_id: string | null;
  updated_at: string;
  created_at: string;
}
