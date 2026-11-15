import { describe, expect, it } from "vitest";
import { buildRevenuePlan, planWindow } from "../../supabase/functions/chat-assistant/revenuePlan";

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

describe("plan only for remaining days", () => {
  const monthSales = [{ venue_id: "v", date: "2026-11-02", total_sales: 30000 }, { venue_id: "v", date: "2026-11-15", total_sales: 5000 }];
  const saved = [
    { venue_id: "v", target_date: "2026-11-03", projected_sales: 20000 }, // past, no sales: counts as already in
    { venue_id: "v", target_date: "2026-11-02", projected_sales: 99999 }, // has sales: sales count instead
    { venue_id: "v", target_date: "2026-11-20", projected_sales: 40000 }, // still open: replaced by the plan
  ];
  it("locks past days and days with sales", () => {
    const w = planWindow("2026-11-15", monthSales, saved);
    expect(w.open("v", "2026-11-14")).toBe(false);
    expect(w.open("v", "2026-11-15")).toBe(false); // today already has sales
    expect(w.open("v", "2026-11-16")).toBe(true);
    expect(w.locked).toBe(30000 + 5000 + 20000);
  });
  it("spreads only what is left over the open days", () => {
    const w = planWindow("2026-11-15", monthSales, saved);
    const r = buildRevenuePlan(2026, 11, 1000000 - w.locked, ["v"], sales, {}, null, w.open);
    expect(r.plan.every((d) => d.date >= "2026-11-16")).toBe(true);
    expect(r.plan.reduce((a, x) => a + x.amount, 0)).toBe(1000000 - w.locked);
  });
});
