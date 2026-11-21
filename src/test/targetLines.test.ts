import { describe, expect, it } from "vitest";
import { dailyHistory, lineKey, periodsOn, sumProjectionRows, venueDayLines, type HistRow, type PeriodLike, type SavedLine } from "@/utils/targetLines";
import { lineDays, sumLines } from "../../supabase/functions/chat-assistant/revenuePlan";

const V = "v1";
const P = (id: string, name: string, sortOrder: number, days: number[] = []): PeriodLike => ({ id, venueId: V, name, isActive: true, isRollupOnly: false, applicableWeekdays: days, effectiveFrom: "2026-01-01", effectiveTo: null, sortOrder });
// Eight Saturdays of history before Sat 12 Dec 2026.
const sats = ["2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05"];
const hist = (rows: HistRow[]) => dailyHistory(rows);
const DATE = "2026-12-12";

describe("targetLines", () => {
  it("line_key matches the database's generated key", () => {
    expect(lineKey("day", null, null)).toBe("day:");
    expect(lineKey("period", "p1", "Buyout")).toBe("period:p1");
    expect(lineKey("event", null, " Smith Wedding ")).toBe("event::smith wedding");
  });

  it("periods follow weekdays, dates and Settings order; rollups never count", () => {
    const ps = [P("d", "Dinner", 2), P("l", "Lunch", 1, [1, 2, 3, 4, 5]), { ...P("r", "Full day", 0), isRollupOnly: true }, { ...P("old", "Brunch", 3), effectiveTo: "2026-11-30" }];
    expect(periodsOn(ps, V, DATE).map((p) => p.name)).toEqual(["Dinner"]); // Saturday: no weekday lunch, brunch ended
    expect(periodsOn(ps, V, "2026-12-11").map((p) => p.name)).toEqual(["Lunch", "Dinner"]);
  });

  it("no period or one period: one line from whole-day history, named after the period", () => {
    const h = hist(sats.map((d) => ({ date: d, periodId: null, sales: 40000, guests: 100, delivery: 0 })));
    const [one] = venueDayLines({ venueId: V, date: DATE, periods: [P("d", "Dinner", 1)], saved: [], hist: h });
    expect(one).toMatchObject({ kind: "day", name: "Dinner", guests: 100, spend: 400, target: 40000, source: "Auto" });
    expect(venueDayLines({ venueId: V, date: DATE, periods: [], saved: [], hist: h })[0].name).toBe("Day");
  });

  it("several periods: one line each, forecast only from sales tagged to that period", () => {
    const h = hist(sats.flatMap((d) => [{ date: d, periodId: "l", sales: 9000, guests: 50, delivery: 0 }]));
    const lines = venueDayLines({ venueId: V, date: DATE, periods: [P("l", "Lunch", 1), P("d", "Dinner", 2)], saved: [], hist: h });
    expect(lines.map((l) => [l.name, l.target, l.source])).toEqual([["Lunch", 9000, "Auto"], ["Dinner", null, ""]]);
  });

  it("delivery is its own line and is not counted as dine-in spend", () => {
    const h = hist(sats.map((d) => ({ date: d, periodId: null, sales: 44000, guests: 100, delivery: 4000 })));
    const lines = venueDayLines({ venueId: V, date: DATE, periods: [], saved: [], hist: h });
    expect(lines.map((l) => [l.kind, l.guests, l.spend, l.target])).toEqual([["day", 100, 400, 40000], ["delivery", null, null, 4000]]);
  });

  it("saved lines win, a buyout keeps its label, events are added", () => {
    const saved: SavedLine[] = [
      { venueId: V, date: DATE, kind: "period", periodId: "d", label: "Buyout", sales: 60000, guests: null, spend: null, bani: true },
      { venueId: V, date: DATE, kind: "event", periodId: null, label: "Private room", sales: 9000, guests: 20, spend: 450, bani: false },
    ];
    const lines = venueDayLines({ venueId: V, date: DATE, periods: [P("l", "Lunch", 1), P("d", "Dinner", 2)], saved, hist: new Map() });
    expect(lines.map((l) => [l.name, l.label, l.target, l.source])).toEqual([["Lunch", null, null, ""], ["Dinner", "Buyout", 60000, "Bani plan"], ["Private room", "Private room", 9000, "Manager"]]);
  });

  it("an older whole-day plan still shows as one line until the day is planned by period", () => {
    const saved: SavedLine[] = [{ venueId: V, date: DATE, kind: "day", periodId: null, label: null, sales: 50000, guests: null, spend: null, bani: true }];
    const lines = venueDayLines({ venueId: V, date: DATE, periods: [P("l", "Lunch", 1), P("d", "Dinner", 2)], saved, hist: new Map() });
    expect(lines.map((l) => [l.kind, l.target])).toEqual([["day", 50000]]);
  });

  it("screens that need one figure per venue-day add the lines up", () => {
    const rows = [{ venue_id: V, target_date: DATE, projected_sales: 11700, line_kind: "period" }, { venue_id: V, target_date: DATE, projected_sales: 60000, line_kind: "period" }, { venue_id: V, target_date: "2026-12-13", projected_sales: 5000, line_kind: "day" }];
    expect(sumProjectionRows(rows).map((r) => [r.target_date, r.projected_sales])).toEqual([[DATE, 71700], ["2026-12-13", 5000]]);
    expect(sumLines(rows).map((r) => r.projected_sales)).toEqual([71700, 5000]);
    expect([...lineDays(rows)]).toEqual([[`${V}|${DATE}`, 71700]]); // Bani's whole-day plan leaves line-planned days alone
  });
});
