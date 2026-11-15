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
