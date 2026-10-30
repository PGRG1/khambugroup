import { describe, expect, it } from "vitest";
import { matcherCanApply, matcherSnapshot, needsMatcherReview, type MatcherAnswer } from "@/utils/scannerMatcher";
describe("scanner matcher safety", () => {
  it("does not replace a person's edited line", () => expect(matcherCanApply(matcherSnapshot({ unit_price: 100 }), { unit_price: 101 }, "a", "a")).toBe(false));
  it("does not apply after supplier changes", () => expect(matcherCanApply(matcherSnapshot({}), {}, "a", "b")).toBe(false));
  it("does not apply to saved invoice", () => expect(matcherCanApply(matcherSnapshot({}), {}, "a", "a", true)).toBe(false));
  it("applies only to unchanged draft", () => expect(matcherCanApply(matcherSnapshot({}), {}, "a", "a")).toBe(true));
  it("background deal metadata does not discard matching", () => expect(matcherCanApply(matcherSnapshot({ quantity: "3" }), { quantity: "3", is_free_unit_line: false }, "a", "a")).toBe(true));
  for (const decision of ["probably", "cant_tell", "new"] as const) it(`${decision} needs review`, () => expect(needsMatcherReview({ decision } as MatcherAnswer)).toBe(true));
  it("sure does not need match review", () => expect(needsMatcherReview({ decision: "sure" } as MatcherAnswer)).toBe(false));
  it("charge does not need match review", () => expect(needsMatcherReview({ decision: "not_a_product" } as MatcherAnswer)).toBe(false));
});