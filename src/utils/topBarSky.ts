// Top bar sky: what the sky looks like for the Hong Kong time of day and the Observatory's weather.
// Pure rules only; TopBarSky draws them.

export type SkyKey =
  | "clear" | "partly" | "cloudy" | "fog" | "lightrain" | "rain" | "heavyrain" | "thunder"
  | "amber" | "red" | "black" | "t1" | "t3" | "t8" | "t10";

type RGB = [number, number, number];
/** drift: how fast the clouds travel, in px a second across a 52 px bar; churn: how fast they change shape;
 *  gust: how much the wind rises and falls (0 steady, 1 squally). */
type Weather = { k: number; grey: RGB | null; cover: number; rain: number; sun: number; stars: number; drift: number; churn: number; gust: number; wind?: number; haze?: number; long?: number; bolt?: number };

/** Sky colours (top, middle, bottom) through a Hong Kong day; colours between two hours blend smoothly. */
const KEYS: [number, [string, string, string]][] = [
  [0, ["#060C20", "#0E1938", "#1C2B55"]], [4.8, ["#0B1330", "#1B2550", "#33386A"]], [6.0, ["#33406E", "#8A6F8E", "#E6A988"]],
  [7.2, ["#6E9CC8", "#C7C7C6", "#F1D3A9"]], [10, ["#6AA8D6", "#A9D0E6", "#E3ECEA"]], [13, ["#5C9FD4", "#9CC8E6", "#D8EAF2"]],
  [16, ["#6AA0CC", "#B3CBDA", "#EDD8B8"]], [17.5, ["#3A4778", "#B5677C", "#F2A35F"]], [18.6, ["#1A2350", "#4B4677", "#9A6A82"]],
  [19.8, ["#0A1129", "#152045", "#26355F"]], [24, ["#060C20", "#0E1938", "#1C2B55"]],
];

export const WEATHER: Record<SkyKey, Weather> = {
  clear:     { k: 0,    grey: null,            cover: 0.4,  rain: 0,    sun: 1,    stars: 1, drift: 7, churn: 1, gust: 0 },
  partly:    { k: 0.2,  grey: [170, 182, 190], cover: 0.46, rain: 0,    sun: 0.75, stars: 0.6, drift: 8, churn: 1, gust: 0.05 },
  cloudy:    { k: 0.45, grey: [150, 164, 174], cover: 0.62, rain: 0,    sun: 0.3,  stars: 0.15, drift: 6, churn: 0.8, gust: 0.05 },
  fog:       { k: 0.5,  grey: [168, 178, 184], cover: 0.5,  rain: 0,    sun: 0.2,  stars: 0, drift: 3, churn: 0.6, gust: 0, haze: 0.22 },
  lightrain: { k: 0.5,  grey: [110, 126, 138], cover: 0.66, rain: 0.16, sun: 0.1,  stars: 0, drift: 10, churn: 1.1, gust: 0.1 },
  rain:      { k: 0.55, grey: [96, 112, 124],  cover: 0.7,  rain: 0.26, sun: 0,    stars: 0, drift: 12, churn: 1.2, gust: 0.15 },
  heavyrain: { k: 0.6,  grey: [80, 96, 108],   cover: 0.74, rain: 0.38, sun: 0,    stars: 0, drift: 14, churn: 1.3, gust: 0.2 },
  thunder:   { k: 0.66, grey: [62, 72, 92],    cover: 0.78, rain: 0.32, sun: 0,    stars: 0, drift: 16, churn: 1.6, gust: 0.3, bolt: 1 },
  amber:     { k: 0.68, grey: [70, 84, 96],    cover: 0.8,  rain: 0.5,  sun: 0,    stars: 0, drift: 16, churn: 1.4, gust: 0.25, haze: 0.08 },
  red:       { k: 0.76, grey: [52, 62, 74],    cover: 0.84, rain: 0.66, sun: 0,    stars: 0, drift: 20, churn: 1.5, gust: 0.3, haze: 0.14, long: 1.3 },
  black:     { k: 0.86, grey: [32, 38, 46],    cover: 0.9,  rain: 0.82, sun: 0,    stars: 0, drift: 24, churn: 1.7, gust: 0.35, haze: 0.22, long: 1.6, bolt: 0.5 },
  t1:        { k: 0.35, grey: [140, 156, 166], cover: 0.52, rain: 0,    sun: 0.5,  stars: 0.3, drift: 18, churn: 1.2, gust: 0.3, wind: 0.25 },
  t3:        { k: 0.55, grey: [104, 120, 130], cover: 0.66, rain: 0.14, sun: 0.1,  stars: 0, drift: 28, churn: 1.4, gust: 0.45, wind: 0.5 },
  t8:        { k: 0.7,  grey: [60, 76, 82],    cover: 0.8,  rain: 0.45, sun: 0,    stars: 0, drift: 45, churn: 1.7, gust: 0.6, wind: 0.8 },
  t10:       { k: 0.82, grey: [36, 48, 54],    cover: 0.9,  rain: 0.72, sun: 0,    stars: 0, drift: 65, churn: 2, gust: 0.8, wind: 1.1, haze: 0.12, bolt: 0.4 },
};

/** Sunrise and sunset in Hong Kong, roughly; only used to place the sun's glow. */
const RISE = 6.4, SET = 17.7;

const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t: number) => t * t * (3 - 2 * t);

/** 1 at night, 0 in daylight, easing through dawn and dusk. */
export function nightOf(h: number): number {
  return h < 5 ? 1 : h < 6.6 ? 1 - (h - 5) / 1.6 : h < 18.2 ? 0 : h < 19.6 ? (h - 18.2) / 1.4 : 1;
}

export type SkyLook = {
  weather: Weather; cols: [RGB, RGB, RGB]; night: number; sunF: number; sunA: number; low: number; moonA: number; starsA: number;
  lit: RGB; shade: RGB; light: boolean;
};

/** Everything the sky needs for an hour (0–24, Hong Kong time) and a weather. `light` = dark text reads on it. */
export function skyLook(hour: number, key: SkyKey): SkyLook {
  const h = ((hour % 24) + 24) % 24, w = WEATHER[key] ?? WEATHER.clear;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [ha, ca] = KEYS[i], [hb, cb] = KEYS[i + 1], t = smooth((h - ha) / (hb - ha));
  let cols = [0, 1, 2].map((j) => mix(hex(ca[j]), hex(cb[j]), t)) as [RGB, RGB, RGB];
  const n = nightOf(h);
  if (w.grey) { const g = mix(w.grey, [18, 24, 34], n * 0.75); cols = cols.map((c) => mix(c, g, w.k)) as [RGB, RGB, RGB]; }
  const f = (h - RISE) / (SET - RISE), up = f > -0.04 && f < 1.04, low = 1 - Math.sin(Math.PI * Math.max(0, Math.min(1, f)));
  let lit = mix([252, 252, 253], [84, 96, 128], n * 0.82);
  if (w.grey) lit = mix(lit, w.grey, w.k * 0.55);
  if (up && w.sun > 0) lit = mix(lit, [255, 176, 128], low * 0.55 * w.sun);
  const shade = mix(lit, mix([70, 80, 96], [8, 12, 24], n), 0.42 + 0.3 * w.k);
  // What the text actually sits on: the sky's middle, covered by cloud as thick as the weather says.
  const seen = mix(cols[1], mix(shade, lit, 0.6), Math.min(1, w.cover * 1.1) * (w.cover > 0.4 ? 1 : 0.4));
  const lum = (0.2126 * seen[0] + 0.7152 * seen[1] + 0.0722 * seen[2]) / 255;
  return { weather: w, cols, night: n, sunF: f, sunA: up ? w.sun : 0, low, moonA: n > 0.15 && !up ? n * Math.max(w.sun, 0.12) : 0, starsA: n * w.stars, lit, shade, light: lum > 0.56 };
}

/** A sky part-way from one weather to another (0 = all `a`, 1 = all `b`), so a change in the weather eases in. */
export function blendLook(a: SkyLook, b: SkyLook, t: number): SkyLook {
  const k = smooth(Math.max(0, Math.min(1, t)));
  if (k >= 1) return b; if (k <= 0) return a;
  const n = (x: number, y: number) => x + (y - x) * k, o = (x?: number, y?: number) => n(x ?? 0, y ?? 0);
  const wa = a.weather, wb = b.weather;
  return {
    weather: { ...wb, cover: n(wa.cover, wb.cover), rain: n(wa.rain, wb.rain), sun: n(wa.sun, wb.sun), stars: n(wa.stars, wb.stars), drift: n(wa.drift, wb.drift),
      churn: n(wa.churn, wb.churn), gust: n(wa.gust, wb.gust), wind: o(wa.wind, wb.wind), haze: o(wa.haze, wb.haze), long: n(wa.long ?? 1, wb.long ?? 1), bolt: k > 0.5 ? wb.bolt : wa.bolt },
    cols: [mix(a.cols[0], b.cols[0], k), mix(a.cols[1], b.cols[1], k), mix(a.cols[2], b.cols[2], k)], night: n(a.night, b.night), sunF: b.sunF,
    sunA: n(a.sunA, b.sunA), low: b.low, moonA: n(a.moonA, b.moonA), starsA: n(a.starsA, b.starsA), lit: mix(a.lit, b.lit, k), shade: mix(a.shade, b.shade, k), light: k > 0.5 ? b.light : a.light,
  };
}

/** Hour of the day in Hong Kong as a decimal (21.5 = 21:30), whatever the device's own time zone. */
export function hkHour(d = new Date()): number {
  return ((d.getUTCHours() + 8) % 24) + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/** The Observatory's warnings in force (rainstorm, typhoon, thunderstorm). */
export const HKO_WARNINGS_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en";

export type SkySignal = { key: SkyKey; label: string; bg: string; fg: string };

const RAIN_SIGNAL: Record<string, SkySignal> = {
  WRAINA: { key: "amber", label: "Amber rain", bg: "#F2B544", fg: "#2A1D05" },
  WRAINR: { key: "red", label: "Red rain", bg: "#D6372B", fg: "#FFFFFF" },
  WRAINB: { key: "black", label: "Black rain", bg: "#111111", fg: "#FFFFFF" },
};

/** Warnings in force, strongest first: typhoon signal, then rainstorm, then thunderstorm. Anything unexpected means none. */
export function readHkoSignal(json: unknown): SkySignal | null {
  if (!json || typeof json !== "object") return null;
  const active = (k: string): string | null => {
    const w = (json as Record<string, { code?: unknown; actionCode?: unknown } | undefined>)[k];
    return w && typeof w.code === "string" && w.actionCode !== "CANCEL" ? w.code : null;
  };
  const tc = active("WTCSGNL");
  if (tc) {
    const white = { bg: "#FFFFFF", fg: "#1F3F3B" };
    if (tc === "TC10" || tc === "TC9") return { key: "t10", label: tc === "TC10" ? "T10" : "T9", ...white };
    if (tc.startsWith("TC8")) return { key: "t8", label: "T8", ...white };
    if (tc === "TC3") return { key: "t3", label: "T3", ...white };
    if (tc === "TC1") return { key: "t1", label: "T1", ...white };
  }
  const rain = active("WRAIN");
  if (rain && RAIN_SIGNAL[rain]) return RAIN_SIGNAL[rain];
  if (active("WTS")) return { key: "thunder", label: "Thunderstorm", bg: "#FFE08A", fg: "#3A2A00" };
  return null;
}

/** The sky for the Observatory's current weather icons (first icon that says something about the sky). */
export function skyFromIcons(icons: number[]): SkyKey {
  for (const c of icons) {
    if (c === 50 || (c >= 70 && c <= 75)) return "clear";
    if (c === 51 || c === 52 || c === 77) return "partly";
    if (c === 60 || c === 61 || c === 76) return "cloudy";
    if (c === 53 || c === 54 || c === 62) return "lightrain";
    if (c === 63) return "rain";
    if (c === 64) return "heavyrain";
    if (c === 65) return "thunder";
    if (c >= 83 && c <= 85) return "fog";
  }
  return "partly";
}
