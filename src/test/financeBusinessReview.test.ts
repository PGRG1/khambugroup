import { describe, expect, it } from "vitest";
import { businessReview, isBusinessFinding } from "@/utils/financeBusinessReview";
import type { Finding, SpecialistReport } from "../../supabase/functions/_shared/financeTeamReview";

const finding = (key: string, value = 100): Finding => ({ key, title: key, assessable: true, severity: "action", statement: "Saved evidence", recommendation: "Saved recommendation", evidence: [], figures: [{ label: "Saved value", value, unit: "HKD", display: "HK$ 100.00", comparison: { label: "Prior period", value: 80, display: "HK$ 80.00", change_pct: 25, change_display: "+25.0%" } }] });
const report = (findings: Finding[]): SpecialistReport => ({ role: "revenue", name: "Revenue Manager", summary: "Routine AI headline must not be used", findings, data_quality: { freshness: "Saved date", completeness: "complete", sources: [], limitations: [] } });

describe("saved business review curation", () => {
  it("excludes routine workflows from summaries, priorities and follow-up eligibility", () => {
    const keys = ["accounting.bank", "accounting.bills_pending", "revenue.payment_mismatch"];
    expect(businessReview([report(keys.map((k) => finding(k)))]).relevant).toEqual([]);
    expect(keys.map(isBusinessFinding)).toEqual([false, false, false]);
  });
  it("leads with revenue and guests and caps changes and priorities at three", () => {
    const model = businessReview([report([finding("accounting.overdue_payables"), finding("procurement.disputes"), finding("procurement.spend"), finding("revenue.guests"), finding("revenue.sales")])]);
    expect(model.changed.map((f) => f.key)).toEqual(["revenue.sales", "revenue.guests", "procurement.spend"]);
    expect(model.priorities).toHaveLength(3);
    expect(model.changed[0].concise).toContain("HK$ 100.00 vs HK$ 80.00 (+25.0%)");
  });
  it("does not present unavailable findings or zero exposure as a priority", () => {
    const unavailable = { ...finding("revenue.sales"), assessable: false };
    expect(businessReview([report([unavailable, finding("accounting.overdue_payables", 0), finding("procurement.disputes", 0)])]).relevant).toEqual([]);
  });
  it("retains the profit and cash limitation without deriving new figures", () => {
    const model = businessReview([report([finding("procurement.spend")])]);
    expect(model.limitation).toContain("profit cannot be assessed and cash is not verified");
    expect(model.changed[0].concise).toContain("HK$ 100.00");
  });
});