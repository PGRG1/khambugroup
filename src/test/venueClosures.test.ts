import { describe, it, expect } from "vitest";
import { makeClosedLookup, ruleCovers } from "@/utils/venueClosures";
import { missingDays } from "@/utils/salesRecordChecks";

const rule = (r: Partial<Parameters<typeof ruleCovers>[0]>) => ({ id: "r", venue_id: "v1", weekday: null, start_date: "2026-10-01", end_date: null, reason: null, ...r });

describe("venue closures", () => {
  it("every Monday covers Mondays from its start date only", () => {
    const r = rule({ weekday: 1 });
    expect(ruleCovers(r, "2026-10-26")).toBe(true); // Monday
    expect(ruleCovers(r, "2026-10-25")).toBe(false); // Sunday
    expect(ruleCovers(r, "2026-09-28")).toBe(false); // Monday before start
  });
  it("a date range covers start to end inclusive", () => {
    const r = rule({ start_date: "2026-10-10", end_date: "2026-10-12" });
    expect(ruleCovers(r, "2026-10-10")).toBe(true);
    expect(ruleCovers(r, "2026-10-12")).toBe(true);
    expect(ruleCovers(r, "2026-10-13")).toBe(false);
  });
  it("closed days are not missing days", () => {
    const lookup = makeClosedLookup([], [rule({ weekday: 1 })]);
    const records = [{ venue: "Assembly", date: "2026-10-20" }] as any;
    const closed = new Set(["2026-10-26"].filter((d) => lookup("v1", d)).map((d) => `v1|${d}`));
    const out = missingDays(records, [{ id: "v1", name: "Assembly" }], "2026-10-25", "2026-10-26", "2026-10-27", undefined, closed);
    expect(out.map((m) => m.date)).toEqual(["2026-10-25"]);
  });
});
