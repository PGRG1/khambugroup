import { describe, expect, it } from "vitest";
import { hkoKind, readHkoWeather, todayLabel } from "@/utils/topBarToday";

const report = (value: unknown, icon: unknown[] = [76]) => ({
  temperature: { data: [{ place: "King's Park", value: 21, unit: "C" }, { place: "Hong Kong Observatory", value, unit: "C" }], recordTime: "2026-11-09T22:00:00+08:00" },
  icon,
});

describe("top bar today line", () => {
  it("writes the date in full on desktop and short on a phone", () => {
    const d = new Date(2026, 10, 9, 22, 0);
    expect(todayLabel(d)).toBe("Monday 9 November");
    expect(todayLabel(d, true)).toBe("Mon 9 Nov");
  });
  it("uses the Observatory's own reading, not another station", () => {
    expect(readHkoWeather(report(23.4), 22)).toEqual({ temp: 23, kind: "cloudy", day: false });
  });
  it("maps the Observatory's icons, skipping wind and humidity codes", () => {
    expect(hkoKind(50)).toEqual({ kind: "clear", night: false });
    expect(hkoKind(72)).toEqual({ kind: "clear", night: true });
    expect(hkoKind(63)).toEqual({ kind: "rain", night: false });
    expect(hkoKind(65)).toEqual({ kind: "storm", night: false });
    expect(hkoKind(82)).toBeNull();
    expect(readHkoWeather(report(25, [82, 51]), 14)).toEqual({ temp: 25, kind: "partly", day: true });
  });
  it("only shows real weather: anything unexpected shows nothing", () => {
    expect(readHkoWeather(report(null))).toBeNull();
    expect(readHkoWeather({ temperature: { data: [{ place: "King's Park", value: 21 }] } })).toBeNull();
    expect(readHkoWeather({ error: true })).toBeNull();
    expect(readHkoWeather(null)).toBeNull();
  });
});
