import { describe, expect, it } from "vitest";
import { gapHint, mappingOf, newLineNames, newLineTitle, normalizeSuggestions, suggestPrompt } from "../../supabase/functions/_shared/newReportLines";
import type { ReadLine } from "../../supabase/functions/_shared/setupReceipt";

const lines: ReadLine[] = [
  { printed: "Net sales", amount: 1000, kind: "total", known: true },
  { printed: "Cash", amount: 400, kind: "payment", known: true },
  { printed: "Visa", amount: 500, kind: "payment", known: true },
  { printed: "Gift card", amount: 100, kind: null, known: false },
];

describe("new report lines", () => {
  it("reads the new line names back from the held reasons, old and new wording", () => {
    expect(newLineNames(["Payments do not add up to total sales", "New on this report: Gift card. Tell Bani what it is"])).toEqual(["Gift card"]);
    expect(newLineNames(["New on this report: Gift card, House acct. Tell Bani what they are"])).toEqual(["Gift card", "House acct"]);
    expect(newLineNames(["New on this report: Gift card. Map it in the sales report setup"])).toEqual(["Gift card"]);
    expect(newLineNames(["Sales already recorded"])).toEqual([]);
    expect(newLineNames(null)).toEqual([]);
  });
  it("words the work item", () => {
    expect(newLineTitle(["Gift card"], "Assembly")).toBe("Gift card is new on Assembly's report");
    expect(newLineTitle(["A", "B"], null)).toBe("2 new lines on a sales report");
  });
  it("tells Bani the payment gap the new line would close", () => {
    expect(gapHint(lines)).toContain("short by 100");
    expect(suggestPrompt(lines, ["Gift card"])).toContain('"Gift card" (100)');
  });
  it("keeps only lines asked about, and asks when Bani gave no answer", () => {
    const out = normalizeSuggestions({ lines: [{ printed: "gift card", kind: "voucher_used", sure: false, why: "gift card redeemed", or: ["payment:bank"] }, { printed: "Visa", kind: "payment", sure: true }] }, lines, ["Gift card"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ printed: "Gift card", amount: 100, value: "voucher_used", sure: false, alternatives: ["payment:bank"] });
    const none = normalizeSuggestions(null, lines, ["Gift card"]);
    expect(none[0].sure).toBe(false);
  });
  it("turns a choice into setup columns, refusing anything unknown", () => {
    expect(mappingOf("sales:food")).toEqual({ kind: "sales", category: "food", settlesTo: null });
    expect(mappingOf("payment:cash")).toEqual({ kind: "payment", category: null, settlesTo: "cash" });
    expect(mappingOf("payment:bank:abc")).toEqual({ kind: "payment", category: null, settlesTo: "bank" });
    expect(mappingOf("voucher_used")).toEqual({ kind: "voucher_used", category: null, settlesTo: null });
    expect(mappingOf("sales:pizza")).toBeNull();
    expect(mappingOf("drop_table")).toBeNull();
  });
});

import { checkRecord, attentionReason } from "@/utils/salesRecordChecks";
import { linesCheck } from "@/components/sales/LinesDayForm";
import type { SalesRecord } from "@/types/sales";

describe("sales days read line by line", () => {
  const base = { date: "2026-11-14", day: "Sat", venue: "Assembly", reportNumber: "", orders: 0, guests: 82, subtotal: 9500, serviceCharge: 950, discount: 0, totalSales: 10450,
    visa: 0, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, cardTips: 0 } as SalesRecord;
  const lines = [
    { printed: "Food", amount: 7200, kind: "sales", known: true }, { printed: "Wine", amount: 2300, kind: "sales", known: true },
    { printed: "Svc", amount: 950, kind: "service_charge", known: true }, { printed: "Octopus", amount: 3200, kind: "payment", known: true },
    { printed: "Visa", amount: 6250, kind: "payment", known: true }, { printed: "Foodpanda", amount: 1000, kind: "delivery", known: true },
  ];
  it("checks payments from the client's own lines, not KHAMBU's columns", () => {
    expect(checkRecord({ ...base, lines }).ok).toBe(true);
    expect(attentionReason({ ...base, lines })).toBeNull();
    expect(attentionReason({ ...base, lines: lines.filter((l) => l.printed !== "Foodpanda") })).toMatch(/1,000 short/);
    // Without lines (KHAMBU) the fixed columns still decide.
    expect(checkRecord(base).ok).toBe(false);
  });
  it("totals a typed-in day and refuses gift card days", () => {
    const setup = [
      { id: "1", venue_id: null, printed_name: "Food", kind: "sales", category: "food", legacy_field: null, sort_order: 1 },
      { id: "2", venue_id: null, printed_name: "Cash", kind: "payment", category: null, legacy_field: null, sort_order: 2 },
      { id: "3", venue_id: null, printed_name: "Gift card", kind: "voucher_used", category: null, legacy_field: null, sort_order: 3 },
    ] as never[];
    const ok = linesCheck(setup, { Food: "500", Cash: "500" });
    expect(ok).toMatchObject({ total: 500, gap: 0, invalid: false, deferred: false });
    expect(ok.lines).toHaveLength(2);
    expect(linesCheck(setup, { Food: "500", Cash: "400" }).gap).toBe(-100);
    expect(linesCheck(setup, { Food: "abc" }).invalid).toBe(true);
    expect(linesCheck(setup, { Food: "500", "Gift card": "500" }).deferred).toBe(true);
  });
});
