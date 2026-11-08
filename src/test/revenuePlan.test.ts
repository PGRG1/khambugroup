import { describe, expect, it } from "vitest";
import { buildRevenuePlan } from "../../supabase/functions/chat-assistant/revenuePlan";

const sales = [
  { venue_id: "v", date: "2026-11-06", total_sales: 60000, guests: 150 }, // Fri
  { venue_id: "v", date: "2026-11-02", total_sales: 20000, guests: 50 }, // Mon
];

describe("daily revenue plan", () => {
  it("splits the monthly goal exactly across trading days", () => {
    const r = buildRevenuePlan(2026, 12, 1000000, ["v"], sales, {});
    expect(r.plan.reduce((a, x) => a + x.amount, 0)).toBe(1000000);
  });
  it("gives busier weekdays more and skips recurring closed weekdays", () => {
    const r = buildRevenuePlan(2026, 12, 1000000, ["v"], sales, { v: [1] });
    expect(r.weekday.find((w) => w.day === "Mon")!.per_day).toBe(0);
    expect(r.weekday.find((w) => w.day === "Fri")!.per_day).toBe(Math.round(1000000 / 4));
  });
  it("derives guests from the chosen average spend", () => {
    const r = buildRevenuePlan(2026, 12, 900000, ["v"], sales, {}, 450);
    expect(r.guests).toBe(2000);
    expect(r.history_spend).toBe(400);
  });
});
