import { describe, it, expect } from "vitest";
import { sanitizeScope, scopeFilterIds, scopeLabel, scopeReminder, toggleScopeVenue, venueScopeMode } from "@/utils/venueScope";

const V = [{ id: "a", name: "Assembly" }, { id: "c", name: "Caliente" }, { id: "h", name: "Hanabi" }, { id: "e", name: "Events" }];
const ids = V.map((v) => v.id);

describe("venue scope", () => {
  it("labels all / one / two / three venues", () => {
    expect(scopeLabel("all", V)).toBe("All venues");
    expect(scopeLabel(["h"], V)).toBe("Hanabi");
    expect(scopeLabel(["c", "a"], V)).toBe("Assembly + Caliente");
    expect(scopeLabel(["a", "c", "h"], V)).toBe("3 venues");
  });
  it("reminder says 'only' for one venue", () => {
    expect(scopeReminder(["h"], V)).toBe("Hanabi only");
    expect(scopeReminder(["a", "c"], V)).toBe("Assembly + Caliente");
  });
  it("unticking the last venue goes back to all", () => {
    expect(toggleScopeVenue(["a"], "a", ids)).toBe("all");
    expect(toggleScopeVenue("all", "a", ids)).toEqual(["a"]);
  });
  it("resets a stored venue that no longer exists or lost access", () => {
    expect(sanitizeScope(["a", "gone"], ids)).toBe("all");
    expect(sanitizeScope(["a", "c"], ids)).toEqual(["a", "c"]);
    expect(sanitizeScope("junk", ids)).toBe("all");
  });
  it("all means no filter, except for restricted users", () => {
    expect(scopeFilterIds("all", ids, false)).toBeNull();
    expect(scopeFilterIds("all", ["a", "c"], true)).toEqual(["a", "c"]);
    expect(scopeFilterIds(["h"], ids, false)).toEqual(["h"]);
  });
  it("bank and ledger pages can't be split by venue", () => {
    expect(venueScopeMode("/bank/dashboard")).toBe("none");
    expect(venueScopeMode("/finance/balance-sheet")).toBe("none");
    expect(venueScopeMode("/revenue")).toBe("split");
  });
});
