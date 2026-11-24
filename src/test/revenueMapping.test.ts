import { describe, expect, it } from "vitest";
import { lineProblem, missingAccount, settlesLabel, unknownNames, suggestAccounts, prefillDraft, fromTypeValue, typeLabel, accountFor, STANDARD_LINES, type MapLine } from "../utils/revenueMapping";
import { basicsFromLines, matchRead } from "../../supabase/functions/_shared/setupReceipt";

const L = (o: Partial<MapLine>): MapLine => ({ key: o.printed_name ?? "x", venue_id: null, printed_name: "x", aliases: [], kind: null, category: null, settles_to: null, processor_ids: [], gl_account_id: null, venue_accounts: {}, method: null, ...o });
const venues = [{ id: "a", name: "Arca" }, { id: "b", name: "Assembly" }];
const rules = [
  { rule_type: "sales_revenue", match_key: "Arca", account_id: "s-a" }, { rule_type: "sales_revenue", match_key: "Assembly", account_id: "s-b" },
  { rule_type: "sales_payment_method", match_key: "visa__Arca", account_id: "c-a" }, { rule_type: "payment_settlement_clearing", match_key: "Assembly", account_id: "c-b" },
  { rule_type: "cash_on_hand", match_key: "Arca", account_id: "cash" }, { rule_type: "cash_on_hand", match_key: "Assembly", account_id: "cash" },
];

describe("revenue setup", () => {
  it("only a missing type stops a save; a missing account is shown, and holds the day when used", () => {
    expect(lineProblem(L({}))).toBe("Select type");
    expect(lineProblem(L({ kind: "payment" }))).toBeNull();
    expect(missingAccount(L({ kind: "payment" }), ["a"])).toBe(true);
    expect(missingAccount(L({ kind: "payment", venue_accounts: { a: "x" } }), ["a", "b"])).toBe(true);
    expect(missingAccount(L({ kind: "payment", venue_accounts: { a: "x", b: "y" } }), ["a", "b"])).toBe(false);
    expect(missingAccount(L({ kind: "guests" }), ["a"])).toBe(false);
  });
  it("sales types carry their group", () => {
    expect(fromTypeValue("sales:bev_alc")).toEqual({ kind: "sales", category: "bev_alc" });
    expect(typeLabel({ kind: "sales", category: "food" })).toBe("Sales · Food");
  });
  it("a payment settled by two processors names both", () => {
    expect(settlesLabel(L({ kind: "payment", settles_to: "bank", processor_ids: ["a", "b"] }), [{ id: "a", name: "KPay" }, { id: "b", name: "Adyen" }])).toBe("KPay + Adyen");
    expect(settlesLabel(L({ kind: "payment", settles_to: "cash" }), [])).toBe("Cash");
  });
  it("unknown printed names only count for venues that use this setup, and other names are known", () => {
    const lines = [L({ printed_name: "Visa", aliases: ["VISA/MC"], kind: "payment" }), L({ key: "v1", venue_id: "v1", printed_name: "Cash", kind: "payment" })];
    const seen = [{ venue_id: "v2", names: ["visa/mc", "Tips"] }, { venue_id: "v1", names: ["Octopus"] }];
    expect(unknownNames(lines, "all", seen, ["v1", "v2"])).toEqual(["Tips"]);
    expect(unknownNames(lines, "v1", seen, ["v1", "v2"])).toEqual(["Octopus"]);
  });
  it("accounts come from How things post: one when venues agree, else one per venue", () => {
    expect(suggestAccounts(L({ kind: "payment", settles_to: "cash", method: "cash" }), rules, venues)).toEqual({ gl_account_id: "cash", venue_accounts: {} });
    expect(suggestAccounts(L({ kind: "payment", settles_to: "bank", method: "visa" }), rules, venues)).toEqual({ gl_account_id: null, venue_accounts: { a: "c-a", b: "c-b" } });
    const l = L({ kind: "sales", category: "other", venue_accounts: { a: "s-a" }, gl_account_id: "g" });
    expect(accountFor(l, "a")).toBe("s-a");
    expect(accountFor(l, "b")).toBe("g");
  });
  it("a fixed-field client starts from its fields: methods, net sales as sales, accounts by venue", () => {
    const draft = prefillDraft([], { hasVersion: false, scansFields: true, rules, venues });
    expect(draft).toHaveLength(STANDARD_LINES.length);
    const sub = draft.find((l) => l.legacy_field === "subtotal")!;
    expect(sub).toMatchObject({ kind: "sales", category: "other", venue_accounts: { a: "s-a", b: "s-b" } });
    expect(draft.find((l) => l.legacy_field === "visa")).toMatchObject({ method: "visa", settles_to: "bank", venue_accounts: { a: "c-a", b: "c-b" } });
    expect(draft.find((l) => l.legacy_field === "cash")).toMatchObject({ method: "cash", gl_account_id: "cash" });
    expect(prefillDraft([], { hasVersion: false, scansFields: false, rules, venues })).toEqual([]);
  });
  it("a saved setup is never rewritten by the prefill", () => {
    const saved = [L({ legacy_field: "subtotal", kind: "subtotal", printed_name: "Subtotal" })];
    expect(prefillDraft(saved, { hasVersion: true, scansFields: true, rules, venues })[0].kind).toBe("subtotal");
  });
  it("payment and delivery lines fill the standard columns by method", () => {
    const r = matchRead({ lines: [{ printed: "VISA/MC", amount: 300 }, { printed: "Cash", amount: 50 }, { printed: "Panda", amount: 20 }] },
      [{ printed: "VISA/MC", kind: "payment", method: "visa" }, { printed: "Cash", kind: "payment", method: "cash" }, { printed: "Panda", kind: "delivery", method: "foodpanda" }]);
    expect(basicsFromLines(r.lines)).toMatchObject({ visa: 300, cash: 50, foodpanda: 20, mastercard: 0 });
  });
});
