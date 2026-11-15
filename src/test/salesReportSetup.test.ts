import { describe, expect, it } from "vitest";
import { normalizeDiscovered } from "../../supabase/functions/parse-receipt/discoverLines";
import { addSample, applyValue, checkSample, missingBasics, valueOf, groupOf, type SetupLine } from "@/utils/salesReportSetup";

const report = normalizeDiscovered({
  date: "2026-11-12", venue: "Harbour Kitchen",
  lines: [
    { printed: "Net sales", amount: 10450, kind: "total" },
    { printed: "Covers", amount: 82, kind: "guests" },
    { printed: "Food", amount: 7200, kind: "sales", category: "food" },
    { printed: "Wine & beer", amount: 2300, kind: "sales", category: "bev_alc" },
    { printed: "Svc chg 10%", amount: 950, kind: "service_charge" },
    { printed: "Octopus", amount: 3200, kind: "payment" },
    { printed: "VISA/MC", amount: 5400, kind: "payment" },
    { printed: "Cash", amount: 850, kind: "payment", settlesTo: "cash" },
    { printed: "Foodpanda", amount: 1000, kind: "delivery" },
  ],
});

describe("reading a sample report", () => {
  it("keeps valid lines and never guesses unknown kinds into sales or payments", () => {
    const r = normalizeDiscovered({ lines: [{ printed: "Mystery", amount: "1,200", kind: "spaceship" }, { printed: "Snacks", amount: 5, kind: "sales", category: "x" }, { printed: "mystery", amount: 1 }] });
    expect(r.lines).toEqual([
      { printed: "Mystery", amount: 1200, kind: "ignore", category: null, settlesTo: null },
      { printed: "Snacks", amount: 5, kind: "sales", category: "other", settlesTo: null },
    ]);
    expect(r.date).toBeNull();
  });
  it("cash settles to cash, other tenders to the bank", () => {
    expect(report.lines.find((l) => l.printed === "Cash")!.settlesTo).toBe("cash");
    expect(report.lines.find((l) => l.printed === "Octopus")!.settlesTo).toBe("bank");
  });
});

describe("setup lines", () => {
  const lines = addSample([], "s1", report);
  it("balances when payments equal total sales", () => {
    expect(checkSample(lines, "s1")).toEqual({ ok: true, reason: null });
  });
  it("names how far off a sample is", () => {
    const off = lines.map((l) => (l.printed === "Cash" ? { ...l, amounts: { s1: 650 } } : l));
    expect(checkSample(off, "s1").reason).toBe("Payments are 200 less than total sales");
  });
  it("a second sample keeps the team's choice and adds its amounts", () => {
    const edited = lines.map((l) => (l.printed === "Food" ? applyValue(l, "sales:dessert") : l));
    const next = addSample(edited, "s2", normalizeDiscovered({ lines: [{ printed: "food", amount: 6000, kind: "sales", category: "food" }, { printed: "FPS", amount: 300, kind: "payment" }] }));
    const food = next.find((l) => l.printed === "Food")!;
    expect(food.category).toBe("dessert");
    expect(food.amounts).toEqual({ s1: 7200, s2: 6000 });
    expect(next.find((l) => l.printed === "FPS")!.kind).toBe("payment");
  });
  it("one select value round-trips every choice", () => {
    const base: SetupLine = { printed: "x", kind: "ignore", category: null, settlesTo: null, bankAccountId: null, amounts: {} };
    for (const v of ["sales:bev_non", "payment:cash", "payment:bank:abc", "payment:bank", "delivery", "guests", "ignore"]) {
      expect(valueOf(applyValue(base, v))).toBe(v);
    }
    expect(groupOf(applyValue(base, "delivery").kind)).toBe("Payments");
  });
  it("lists basics the report doesn't print", () => {
    expect(missingBasics(lines)).toEqual(["orders"]);
  });
});
