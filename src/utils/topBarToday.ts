// Top bar "today" line: the date and the live weather (Open-Meteo, free, no key).

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Monday 9 November" on desktop, "Mon 9 Nov" on a phone. */
export function todayLabel(d: Date, short = false): string {
  const day = DAYS[d.getDay()], month = MONTHS[d.getMonth()];
  return short ? `${day.slice(0, 3)} ${d.getDate()} ${month.slice(0, 3)}` : `${day} ${d.getDate()} ${month}`;
}

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** WMO weather code (as Open-Meteo returns it) to the icon we show. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

export const WEATHER_WORD: Record<WeatherKind, string> = {
  clear: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", drizzle: "Drizzle", rain: "Rain", snow: "Snow", storm: "Thunderstorm",
};

/** Hong Kong until venues carry their own coordinates. */
export const DEFAULT_PLACE = { lat: 22.3193, lon: 114.1694, city: "Hong Kong" };

export const weatherUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;

/** Reads Open-Meteo's answer; anything unexpected means "no weather", never a made-up value. */
export function readWeather(json: unknown): { temp: number; kind: WeatherKind; day: boolean } | null {
  const c = (json as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown } } | null)?.current;
  if (!c || typeof c.temperature_2m !== "number" || !Number.isFinite(c.temperature_2m) || typeof c.weather_code !== "number") return null;
  return { temp: Math.round(c.temperature_2m), kind: weatherKind(c.weather_code), day: c.is_day !== 0 };
}
