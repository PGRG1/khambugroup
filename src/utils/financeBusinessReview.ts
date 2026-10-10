import type { Finding, SpecialistReport } from "../../supabase/functions/_shared/financeTeamReview";

const BUSINESS_KEYS = ["revenue.sales", "revenue.guests", "procurement.spend", "procurement.disputes", "accounting.overdue_payables"];
export const isBusinessFinding = (key: string) => BUSINESS_KEYS.includes(key);

/** Presentation only: repeat saved display strings, never recalculate financial figures. */
export function businessReview(specialists: SpecialistReport[]) {
  const findings = specialists.flatMap((s) => s.findings.map((f) => ({ ...f, specialist: s.role })))
    .filter((f) => isBusinessFinding(f.key) && f.assessable);
  const hasExposure = (f: Finding) => f.figures.some((x) => (f.key !== "accounting.overdue_payables" || x.unit === "HKD") && x.value != null && x.value > 0);
  const relevant = findings.filter((f) => !["procurement.disputes", "accounting.overdue_payables"].includes(f.key) || hasExposure(f));
  const ranked = BUSINESS_KEYS.flatMap((key) => relevant.filter((f) => f.key === key));
  const text = (f: Finding) => {
    const values = f.figures.filter((x) => x.unit !== "count");
    if (f.key === "procurement.disputes") return `Supplier disputes: ${values.map((x) => x.display).join("; ") || "amount not recorded"}.`;
    if (f.key === "accounting.overdue_payables") return `Past-due exposure: ${values.map((x) => `${x.label.toLowerCase()} ${x.display}`).join("; ")}.`;
    return values.map((x) => `${x.label === "Revenue (subtotal + service charge)" ? "Revenue" : x.label === "Invoice spend" ? "Purchases recorded" : x.label}: ${x.display}${x.comparison?.value != null ? ` vs ${x.comparison.display} (${x.comparison.change_display})` : ""}`).slice(0, f.key === "revenue.guests" ? 2 : 1).join(" · ");
  };
  const changed = ranked.slice(0, 3).map((f) => ({ ...f, concise: text(f) }));
  const priorities = ranked.filter((f) => f.recommendation && f.severity !== "info").slice(0, 3);
  const implications = relevant.filter((f) => ["procurement.disputes", "accounting.overdue_payables"].includes(f.key)).map(text);
  const sales = relevant.find((f) => f.key === "revenue.sales");
  const change = sales?.figures[0]?.comparison;
  if (change?.change_pct != null) implications.unshift(`Revenue is ${change.change_pct < 0 ? "lower" : change.change_pct > 0 ? "higher" : "unchanged"} against the saved comparison (${change.change_display}).`);
  const partial = specialists.filter((s) => s.role !== "accounting" && s.data_quality.completeness !== "complete").length > 0;
  return { relevant: ranked.map((f) => ({ ...f, concise: text(f) })), changed, priorities,
    implication: implications.slice(0, 2).join(" ") || "The saved figures do not establish a comparable business change or its cause.",
    limitation: ranked.length ? `${partial ? "Recorded sales or purchases may be incomplete. " : ""}Purchases are not cost of goods sold; profit cannot be assessed and cash is not verified in this review.` : null };
}