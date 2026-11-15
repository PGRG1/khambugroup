import { describe, expect, it } from "vitest";
import { hkHour, readHkoSignal, skyFromIcons, skyLook } from "@/utils/topBarSky";

describe("top bar sky", () => {
  it("follows Hong Kong time whatever the device's time zone", () => {
    expect(hkHour(new Date("2026-11-15T13:30:00Z"))).toBeCloseTo(21.5);
    expect(hkHour(new Date("2026-11-15T20:00:00Z"))).toBeCloseTo(4);
  });
  it("is dark at night, light at midday, with the moon only at night", () => {
    const night = skyLook(22, "clear"), noon = skyLook(13, "clear");
    expect(night.light).toBe(false); expect(night.moonA).toBeGreaterThan(0); expect(night.sunA).toBe(0);
    expect(noon.light).toBe(true); expect(noon.moonA).toBe(0); expect(noon.sunA).toBe(1);
    expect(skyLook(15, "black").light).toBe(false);
  });
  it("strongest warning wins: typhoon, then rainstorm, then thunderstorm; cancelled ones are ignored", () => {
    expect(readHkoSignal({ WRAIN: { code: "WRAINR", actionCode: "ISSUE" }, WTCSGNL: { code: "TC8NE", actionCode: "ISSUE" } })?.label).toBe("T8");
    expect(readHkoSignal({ WRAIN: { code: "WRAINB", actionCode: "EXTEND" }, WTS: { code: "WTS" } })?.key).toBe("black");
    expect(readHkoSignal({ WRAIN: { code: "WRAINA", actionCode: "CANCEL" }, WTS: { code: "WTS", actionCode: "ISSUE" } })?.key).toBe("thunder");
    expect(readHkoSignal({ WTCSGNL: { code: "TC10" } })?.key).toBe("t10");
    expect(readHkoSignal({})).toBeNull();
    expect(readHkoSignal(null)).toBeNull();
  });
  it("reads the sky from the Observatory's icons, skipping wind and humidity codes", () => {
    expect(skyFromIcons([82, 64])).toBe("heavyrain");
    expect(skyFromIcons([70])).toBe("clear");
    expect(skyFromIcons([76])).toBe("cloudy");
    expect(skyFromIcons([])).toBe("partly");
  });
});
