import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpecialistReport, Synthesis } from "../../../supabase/functions/_shared/financeTeamReview";

const SEV: Record<string, string> = { action: "chip-danger", watch: "chip-warn", info: "chip-neutral" };
const SEV_LABEL: Record<string, string> = { action: "Needs action", watch: "Watch", info: "Info" };

/** Latest saved Finance Team review, shown as the home briefing. Read-only. */
export function FinanceTeamBriefing() {
  const { tenantId } = useActiveTenant();

  const q = useQuery({
    queryKey: ["home", "financeTeamLatest", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_team_reviews")
        .select("id,venue_label,review_type,period_end,status,specialists,synthesis,generated_at")
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .order("generated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as null | {
        id: string; venue_label: string; review_type: string; period_end: string;
        specialists: SpecialistReport[]; synthesis: Synthesis; generated_at: string | null;
      };
    },
  });

  if (q.isLoading) return <Skeleton className="h-[180px] rounded-xl" />;
  const r = q.data;

  if (!r) {
    return (
      <div className="glass-surface rounded-xl border border-border/60 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold">Your Finance Team hasn't reviewed the books yet.</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">Run the first review and each specialist will tell you what to check and what to do next.</p>
        </div>
        <Link to="/finance-team" className="text-[12px] font-medium text-primary inline-flex items-center gap-1 shrink-0">
          Run review <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  const specialists = r.specialists ?? [];

  return (
    <div className="space-y-3">
      <div className="glass-surface rounded-xl border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Finance Director · {r.review_type === "weekly" ? "Weekly" : "Daily"} briefing · {r.venue_label}
          </p>
          <Link to="/finance-team" className="text-[12px] font-medium text-primary inline-flex items-center gap-1 shrink-0">
            Full review <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <h2 className="font-display text-[18px] font-semibold mt-1.5 leading-snug">{r.synthesis?.headline}</h2>
        {r.synthesis?.priorities?.length ? (
          <ol className="mt-3 space-y-2">
            {r.synthesis.priorities.slice(0, 3).map((p, i) => (
              <li key={p.finding_key} className="flex gap-2 text-[13px]">
                <span className="td-num text-muted-foreground shrink-0">{i + 1}.</span>
                <span className="min-w-0">
                  <span className="font-medium">{p.title}</span>
                  {p.recommendation ? <span className="text-muted-foreground"> — {p.recommendation}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {specialists.map((s) => {
          const top = [...(s.findings ?? [])].sort((a, b) => rank(a.severity) - rank(b.severity))[0];
          return (
            <Link key={s.role} to="/finance-team" className="glass-surface rounded-xl border border-border/60 p-3.5 hover:bg-muted/40 transition-colors block">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold truncate">{s.name}</p>
                {top ? <span className={`chip ${SEV[top.severity] ?? "chip-neutral"}`}>{SEV_LABEL[top.severity] ?? top.severity}</span> : null}
              </div>
              <p className="text-[12px] text-muted-foreground mt-1 line-clamp-3">{top?.recommendation || top?.statement || s.summary}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const rank = (s: string) => (s === "action" ? 0 : s === "watch" ? 1 : 2);
