// Top bar "today" line: the date and the live weather from the Hong Kong Observatory (free open data, no key).

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Monday 9 November" on desktop, "Mon 9 Nov" on a phone. */
export function todayLabel(d: Date, short = false): string {
  const day = DAYS[d.getDay()], month = MONTHS[d.getMonth()];
  return short ? `${day.slice(0, 3)} ${d.getDate()} ${month.slice(0, 3)}` : `${day} ${d.getDate()} ${month}`;
}

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Hong Kong Observatory weather icon codes to the icon we show. Wind/humidity/temperature codes (80–93) say nothing about sky, so they are skipped. */
export function hkoKind(code: number): { kind: WeatherKind; night: boolean } | null {
  if (code === 50) return { kind: "clear", night: false };
  if (code >= 70 && code <= 75) return { kind: "clear", night: true };
  if (code === 77) return { kind: "partly", night: true };
  if (code === 51 || code === 52) return { kind: "partly", night: false };
  if (code === 76) return { kind: "cloudy", night: true };
  if (code === 60 || code === 61) return { kind: "cloudy", night: false };
  if (code === 62) return { kind: "drizzle", night: false };
  if (code === 53 || code === 54 || code === 63 || code === 64) return { kind: "rain", night: false };
  if (code === 65) return { kind: "storm", night: false };
  if (code >= 83 && code <= 85) return { kind: "fog", night: false };
  return null;
}

export const WEATHER_WORD: Record<WeatherKind, string> = {
  clear: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", drizzle: "Light rain", rain: "Rain", snow: "Snow", storm: "Thunderstorm",
};

export const DEFAULT_PLACE = { city: "Hong Kong", station: "Hong Kong Observatory" };

/** The Observatory's current weather report, updated hourly. */
export const HKO_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en";

/** Reads the Observatory's report; anything unexpected means "no weather", never a made-up value. */
export function readHkoWeather(json: unknown, hour = new Date().getHours()): { temp: number; kind: WeatherKind; day: boolean } | null {
  const j = json as { temperature?: { data?: { place?: unknown; value?: unknown; unit?: unknown }[] }; icon?: unknown } | null;
  const rows = Array.isArray(j?.temperature?.data) ? j!.temperature!.data! : [];
  const row = rows.find((r) => r?.place === DEFAULT_PLACE.station && typeof r.value === "number");
  if (!row || typeof row.value !== "number" || !Number.isFinite(row.value) || (row.unit != null && row.unit !== "C")) return null;
  const icons = Array.isArray(j?.icon) ? (j!.icon as unknown[]).filter((c): c is number => typeof c === "number") : [];
  const sky = icons.map(hkoKind).find(Boolean) ?? null;
  const day = sky ? !sky.night && hour >= 6 && hour < 18 : hour >= 6 && hour < 18;
  return { temp: Math.round(row.value), kind: sky?.kind ?? "partly", day };
}
