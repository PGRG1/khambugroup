import { describe, expect, it } from "vitest";
import { matcherCanApply, matcherSnapshot, needsMatcherReview, type MatcherAnswer } from "@/utils/scannerMatcher";
describe("scanner matcher safety", () => {
  it("does not replace a person's edited line", () => expect(matcherCanApply(matcherSnapshot({ price: 100 }), { price: 101 }, "a", "a")).toBe(false));
  it("does not apply after supplier changes", () => expect(matcherCanApply("{}", {}, "a", "b")).toBe(false));
  it("does not apply to saved invoice", () => expect(matcherCanApply("{}", {}, "a", "a", true)).toBe(false));
  it("applies only to unchanged draft", () => expect(matcherCanApply("{}", {}, "a", "a")).toBe(true));
  for (const decision of ["probably", "cant_tell", "new"] as const) it(`${decision} needs review`, () => expect(needsMatcherReview({ decision } as MatcherAnswer)).toBe(true));
  it("sure does not need match review", () => expect(needsMatcherReview({ decision: "sure" } as MatcherAnswer)).toBe(false));
  it("charge does not need match review", () => expect(needsMatcherReview({ decision: "not_a_product" } as MatcherAnswer)).toBe(false));
});