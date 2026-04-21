import { getWeatherCondition } from "@weather/shared";

const iconToEmoji: Record<string, string> = {
  sun: "☀️",
  "sun-cloud": "🌤️",
  "cloud-sun": "⛅",
  cloud: "☁️",
  fog: "🌫️",
  drizzle: "🌦️",
  rain: "🌧️",
  "rain-heavy": "🌧️",
  snow: "🌨️",
  "snow-heavy": "❄️",
  thunderstorm: "⛈️",
};

export default function WeatherIcon({
  code,
  size = "text-5xl",
  title,
}: {
  code: number;
  size?: string;
  title?: string;
}) {
  const cond = getWeatherCondition(code);
  const emoji = iconToEmoji[cond.icon] ?? "☁️";
  return (
    <span
      role="img"
      aria-label={title ?? cond.description}
      title={title ?? cond.description}
      className={`${size} inline-block leading-none`}
    >
      {emoji}
    </span>
  );
}
