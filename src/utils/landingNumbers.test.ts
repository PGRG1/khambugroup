import { describe, expect, it } from "vitest";
import { compare, guestsPerDay, mtdWindows, salesPerDay, spendPerGuest } from "./landingNumbers";

const r = (date: string, sub: number, sc: number, guests: number, venue = "a") => ({ date, venue_id: venue, subtotal: sub, service_charge: sc, guests });

describe("landing numbers", () => {
  it("sales a day = (subtotal + service charge) ÷ unique trading days", () => {
    expect(salesPerDay([r("2026-11-01", 900, 100, 10), r("2026-11-02", 1800, 200, 20)]).value).toBe(1500);
  });
  it("never returns 0 or NaN when there is nothing to divide", () => {
    expect(salesPerDay([]).value).toBeNull();
    expect(guestsPerDay([r("2026-11-01", 100, 0, 0)]).value).toBeNull();
    expect(spendPerGuest([r("2026-11-01", 100, 0, 0)]).why).toBe("guest counts aren't recorded");
    expect(compare({ value: 100 }, { value: null }).changePct).toBeNull();
  });
  it("spend per guest uses revenue ÷ guests", () => {
    expect(spendPerGuest([r("2026-11-01", 900, 100, 4)]).value).toBe(250);
  });
  it("compares against the same days last year", () => {
    expect(compare({ value: 80 }, { value: 100 }).changePct).toBe(-20);
    expect(mtdWindows(new Date(2026, 10, 15))).toMatchObject({ from: "2026-11-01", to: "2026-11-14", lyFrom: "2025-11-01", lyTo: "2025-11-14" });
  });
});
