// The same "things need you" list Home shows, so Bani and Home never disagree.
// Home: latest completed finance team review for the scope, findings with a
// recommendation and severity action or watch, action first.
import type { Finding, SpecialistReport } from "../_shared/financeTeamReview.ts";

export function needsFromReview(review: { specialists?: SpecialistReport[] | null } | null) {
  const all: Finding[] = (review?.specialists ?? []).flatMap((sp) => sp.findings ?? []);
  return all
    .filter((f) => f.recommendation && (f.severity === "action" || f.severity === "watch"))
    .sort((a, b) => (a.severity === "action" ? 0 : 1) - (b.severity === "action" ? 0 : 1))
    .map((f) => ({ title: f.title, severity: f.severity, statement: f.statement, recommendation: f.recommendation, figures: (f.figures ?? []).map((x) => `${x.label}: ${x.display}`) }));
}

/** Home's scope: a one-venue business sees the whole-business review; otherwise the picked venue. */
export async function homeNeeds(client: any, tenantId: string, scopeVenue: string | null) {
  const { data: venues, error: vErr } = await client.from("venues").select("id,name").eq("tenant_id", tenantId).eq("is_active", true);
  if (vErr) throw new Error(vErr.message);
  const picked = scopeVenue && (venues ?? []).length > 1 ? (venues ?? []).find((v: any) => v.name.toLowerCase() === scopeVenue.toLowerCase()) : null;
  let q = client.from("finance_team_reviews").select("specialists,generated_at").eq("tenant_id", tenantId).eq("status", "completed").order("generated_at", { ascending: false }).limit(1);
  q = picked ? q.eq("venue_id", picked.id) : q.is("venue_id", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { note: "Exactly the list Home shows under \"things need you\". Go through these first, in this order.", as_of: data?.[0]?.generated_at ?? null, items: needsFromReview(data?.[0] ?? null) };
}
