import { describe, expect, it } from "vitest";
import { readWeather, todayLabel, weatherKind } from "@/utils/topBarToday";

describe("top bar today line", () => {
  it("writes the date in full on desktop and short on a phone", () => {
    const d = new Date(2026, 10, 9, 22, 0);
    expect(todayLabel(d)).toBe("Monday 9 November");
    expect(todayLabel(d, true)).toBe("Mon 9 Nov");
  });
  it("maps weather codes to the right icon", () => {
    expect(weatherKind(0)).toBe("clear");
    expect(weatherKind(2)).toBe("partly");
    expect(weatherKind(3)).toBe("cloudy");
    expect(weatherKind(61)).toBe("rain");
    expect(weatherKind(81)).toBe("rain");
    expect(weatherKind(95)).toBe("storm");
  });
  it("only shows real weather: anything unexpected shows nothing", () => {
    expect(readWeather({ current: { temperature_2m: 22.6, weather_code: 3, is_day: 0 } })).toEqual({ temp: 23, kind: "cloudy", day: false });
    expect(readWeather({ current: { temperature_2m: null, weather_code: 3 } })).toBeNull();
    expect(readWeather({ error: true })).toBeNull();
    expect(readWeather(null)).toBeNull();
  });
});
