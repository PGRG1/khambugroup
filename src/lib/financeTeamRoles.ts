/* Bani's finance team: the five roles and how a saved review splits into per-role views.
   Shared by the login page, the home page and the sidebar counts. */
import type { Finding, Figure, SpecialistReport, Synthesis } from "../../supabase/functions/_shared/financeTeamReview";

export type Role = "revenue" | "procurement" | "accountant" | "people" | "controller";
export const ROLES: { key: Role; name: string; title: string; sub: string }[] = [
  { key: "revenue", name: "Marcus", title: "Revenue Manager", sub: "Looks after your sales" },
  { key: "procurement", name: "Dex", title: "Procurement Manager", sub: "Looks after suppliers and stock" },
  { key: "accountant", name: "Mr Lau", title: "Accountant", sub: "Looks after bills to pay and the books" },
  { key: "people", name: "Amara", title: "People Manager", sub: "Looks after rosters, leave and pay" },
  { key: "controller", name: "Vivian", title: "Financial Controller", sub: "Looks after cash, running costs and month-end" },
];

/** Old saved reviews used role "accounting"; map their finding keys onto the new roles. */
function roleOfFinding(key: string): Role {
  if (key === "accounting.overdue_payables" || key === "accounting.bills_pending") return "accountant";
  if (key === "accounting.bank") return "controller";
  const p = key.split(".")[0];
  return (["revenue", "procurement", "accountant", "people", "controller"].includes(p) ? p : "controller") as Role;
}

export interface Review {
  id: string; venue_id: string | null; venue_label: string; review_type: string;
  period_start: string; period_end: string; status: string; generated_at: string | null;
  specialists: SpecialistReport[]; synthesis: Synthesis;
}

export interface RoleView {
  role: Role;
  summary: string;
  headline: { value: Figure; note: string } | null;
  workDone: { label: string; count: number }[];
  findings: Finding[];
}

/** Normalize any saved review (old or new shape) into per-role views. */
export function roleViews(review: Review): RoleView[] {
  return ROLES.map(({ key }) => {
    const mine: Finding[] = [];
    let summary = "";
    let headline: RoleView["headline"] = null;
    let workDone: { label: string; count: number }[] = [];
    for (const sp of review.specialists ?? []) {
      const sps = (sp.findings ?? []).filter((f) => roleOfFinding(f.key) === key);
      if ((sp.role as string) === key) {
        summary = sp.summary || summary;
        headline = sp.headline ?? headline;
        workDone = sp.work_done ?? [];
      }
      mine.push(...sps);
    }
    if (!summary && mine.length) summary = mine[0].statement;
    // Fallback headlines for old reviews that predate the headline field.
    if (!headline) {
      const pick = (k: string, note: string) => {
        const f = mine.find((x) => x.key === k);
        const v = f?.figures?.[0];
        return f?.assessable && v ? { value: v, note } : null;
      };
      if (key === "revenue") headline = pick("revenue.sales", "latest period");
      if (key === "accountant") headline = pick("accounting.overdue_payables", "overdue");
      if (key === "controller") {
        const bank = mine.find((x) => x.key === "accounting.bank" || x.key === "controller.bank");
        const bal = bank?.figures?.find((x) => x.unit === "HKD" && /balance/i.test(x.label));
        if (bal) headline = { value: bal, note: "last statement balance" };
      }
    }
    return { role: key, summary, headline, workDone, findings: mine };
  });
}

