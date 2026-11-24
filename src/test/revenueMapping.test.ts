import { describe, expect, it } from "vitest";
import { lineProblem, settlesLabel, unknownNames, suggestAccount, fromTypeValue, typeLabel, type MapLine } from "../utils/revenueMapping";

const L = (o: Partial<MapLine>): MapLine => ({ key: o.printed_name ?? "x", venue_id: null, printed_name: "x", aliases: [], kind: null, category: null, settles_to: null, processor_ids: [], gl_account_id: null, ...o });

describe("revenue mapping", () => {
  it("a line needs a type, and an account unless it is never posted", () => {
    expect(lineProblem(L({}))).toBe("Select type");
    expect(lineProblem(L({ kind: "payment" }))).toBe("Select account");
    expect(lineProblem(L({ kind: "guests" }))).toBeNull();
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
  it("suggests the account How things post already uses, only when there is one", () => {
    const rules = [{ rule_type: "payment_settlement_clearing", match_key: "A", account_id: "c1" }, { rule_type: "payment_settlement_clearing", match_key: "B", account_id: "c1" }];
    expect(suggestAccount(L({ kind: "payment", settles_to: "bank" }), rules, "All venues", ["A", "B"])).toBe("c1");
    expect(suggestAccount(L({ kind: "payment", settles_to: "bank" }), [...rules, { rule_type: "payment_settlement_clearing", match_key: "C", account_id: "c2" }], "All venues", ["A", "B", "C"])).toBeNull();
  });
});
