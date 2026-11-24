import { describe, expect, it } from "vitest";
import { buildRows, rowProblem, accountAt } from "../utils/purchasingSetup";

const venues = [{ id: "a", name: "Arca" }, { id: "b", name: "Assembly" }];
describe("purchasing setup", () => {
  it("one row per category with today's accounts, per venue where set", () => {
    const rows = buildRows(
      [{ financial_treatment: "COGS", level1_category: "Food" }, { financial_treatment: "COGS", level1_category: "Food" }, { financial_treatment: "", level1_category: "Other" }],
      [{ rule_type: "procurement_category", match_key: "COGS__Food", account_id: "f" }, { rule_type: "procurement_category_venue", match_key: "COGS__Food__Assembly", account_id: "fb" }],
      venues);
    const food = rows.find((r) => r.category === "Food")!;
    expect(food).toMatchObject({ products: 2, account_id: "f", venue_accounts: { b: "fb" } });
    expect(accountAt(food, "b")).toBe("fb");
    expect(accountAt(food, "a")).toBe("f");
    expect(rowProblem(food, ["a", "b"])).toBeNull();
    expect(rowProblem(rows.find((r) => r.category === "Other")!, ["a", "b"])).toBe("Select group");
  });
  it("a category without an account for every venue still needs one", () => {
    const [r] = buildRows([{ financial_treatment: "OpEx", level1_category: "Services" }], [{ rule_type: "procurement_category_venue", match_key: "OpEx__Services__Arca", account_id: "x" }], venues);
    expect(rowProblem(r, ["a", "b"])).toBe("No account");
  });
});
