import { describe, expect, it } from "vitest";
import { checkRulePattern, canApproveRules } from "../../supabase/functions/_shared/rulePatternSafety";
import { teachMessage } from "@/utils/ruleTeachResult";

describe("checkRulePattern", () => {
  it("keeps the narrow rules businesses already use", () => {
    for (const text of ["KPAY MERCHANT", "AUTOPAY PAYROLL", "MPF CONTRIBUTION", "PEEL STREET PROPERTIES", "CASH DEPOSIT"]) {
      expect(checkRulePattern({ contains: text })).toEqual({ ok: true, pattern: { contains: text } });
    }
  });
  it("refuses regular expressions and unknown keys", () => {
    expect(checkRulePattern({ regex: ".*" }).ok).toBe(false);
    expect(checkRulePattern({ contains: "KPAY MERCHANT", regex: "x" }).ok).toBe(false);
  });
  it("refuses text that is too short or too general", () => {
    expect(checkRulePattern({ contains: "HK" }).ok).toBe(false);
    expect(checkRulePattern({ contains: "  ab " }).ok).toBe(false);
    expect(checkRulePattern({ contains: "12345678" }).ok).toBe(false);
    expect(checkRulePattern({ contains: "FPS PAYMENT" }).ok).toBe(false);
    expect(checkRulePattern({ contains: "Transfer to 0123" }).ok).toBe(false);
  });
  it("refuses empty patterns and rules on amounts, dates or ids", () => {
    expect(checkRulePattern({}).ok).toBe(false);
    expect(checkRulePattern(null).ok).toBe(false);
    expect(checkRulePattern({ eq: { amount: "100" } }).ok).toBe(false);
    expect(checkRulePattern({ eq_all: { supplier_id: "x" } }).ok).toBe(false);
    expect(checkRulePattern({ eq: { unit_norm: "" } }).ok).toBe(false);
  });
  it("accepts exact field values and trims text", () => {
    expect(checkRulePattern({ eq_all: { description_norm: "chicken thigh", unit_norm: "kg" } }).ok).toBe(true);
    expect(checkRulePattern({ contains: "  Peel Street  " })).toEqual({ ok: true, pattern: { contains: "Peel Street" } });
  });
});

describe("canApproveRules", () => {
  it("lets Bani, business admins and Finance approvers switch rules on", () => {
    expect(canApproveRules("member", true)).toBe(true);
    expect(canApproveRules("tenant_admin", false)).toBe(true);
    expect(canApproveRules("member", false, 3)).toBe(true);
  });
  it("sends everyone else's rules for approval", () => {
    expect(canApproveRules("member", false)).toBe(false);
    expect(canApproveRules("member", false, 2)).toBe(false);
    expect(canApproveRules("viewer", false, null)).toBe(false);
  });
});

describe("teachMessage", () => {
  it("says whether the rule is live, waiting or refused", () => {
    expect(teachMessage(false, null).title).toBe("Classification applied");
    expect(teachMessage(true, { rule_status: "active" }).title).toMatch(/saved as a rule/);
    expect(teachMessage(true, { rule_status: "needs_review" }).title).toMatch(/approval/);
    expect(teachMessage(true, { rule_refused: "The matching text is too general" }).title).toMatch(/not saved/);
  });
});
