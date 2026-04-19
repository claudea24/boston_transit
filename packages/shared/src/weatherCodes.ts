export interface WeatherCondition {
  description: string;
  icon: string;
}

export const weatherCodeMap: Record<number, WeatherCondition> = {
  0: { description: "Clear sky", icon: "sun" },
  1: { description: "Mainly clear", icon: "sun-cloud" },
  2: { description: "Partly cloudy", icon: "cloud-sun" },
  3: { description: "Overcast", icon: "cloud" },
  45: { description: "Fog", icon: "fog" },
  48: { description: "Depositing rime fog", icon: "fog" },
  51: { description: "Light drizzle", icon: "drizzle" },
  53: { description: "Moderate drizzle", icon: "drizzle" },
  55: { description: "Dense drizzle", icon: "drizzle" },
  61: { description: "Slight rain", icon: "rain" },
  63: { description: "Moderate rain", icon: "rain" },
  65: { description: "Heavy rain", icon: "rain-heavy" },
  71: { description: "Slight snow", icon: "snow" },
  73: { description: "Moderate snow", icon: "snow" },
  75: { description: "Heavy snow", icon: "snow-heavy" },
  77: { description: "Snow grains", icon: "snow" },
  80: { description: "Slight rain showers", icon: "rain" },
  81: { description: "Moderate rain showers", icon: "rain" },
  82: { description: "Violent rain showers", icon: "rain-heavy" },
  85: { description: "Slight snow showers", icon: "snow" },
  86: { description: "Heavy snow showers", icon: "snow-heavy" },
  95: { description: "Thunderstorm", icon: "thunderstorm" },
  96: { description: "Thunderstorm with slight hail", icon: "thunderstorm" },
  99: { description: "Thunderstorm with heavy hail", icon: "thunderstorm" },
};

export function getWeatherCondition(code: number): WeatherCondition {
  return weatherCodeMap[code] ?? { description: "Unknown", icon: "cloud" };
}
