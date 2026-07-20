import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fmtHKWhole } from "@/components/expenses/shared";
import { TrendingUp } from "lucide-react";

function pctAvailable(pct: number | null, labor: number) {
  return pct != null && Number(labor || 0) > 0;
}

interface Props {
  year: number;
  month: number;
}

interface LaborRow {
  venue: string;
  labor_cost: number;
  revenue: number;
  labor_cost_pct: number | null;
}

/** Labor cost % of revenue by venue for the selected payroll month. */
export function PayrollLaborCostCard({ year, month }: Props) {
  const { tenantId } = useActiveTenant();
  const [rows, setRows] = useState<LaborRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("v_labor_cost_by_venue_month")
        .select("venue, labor_cost, revenue, labor_cost_pct")
        .eq("tenant_id", tenantId)
        .eq("year", year)
        .eq("month", month)
        .order("labor_cost", { ascending: false });
      setRows((data as LaborRow[]) || []);
      setLoading(false);
    })();
  }, [tenantId, year, month]);

  const totals = rows.reduce(
    (acc, r) => ({
      labor: acc.labor + Number(r.labor_cost || 0),
      revenue: acc.revenue + Number(r.revenue || 0),
    }),
    { labor: 0, revenue: 0 },
  );
  const totalPct = totals.revenue > 0 ? (totals.labor / totals.revenue) * 100 : null;

  const pctTone = (p: number | null) =>
    p == null
      ? "text-muted-foreground"
      : p > 40
      ? "text-destructive"
      : p > 30
      ? "text-warning"
      : "text-primary";

  const totalPctAvailable = totalPct != null && totals.labor > 0;

  return (
    <TooltipProvider delayDuration={100}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Labor Cost % of Revenue</div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-lg font-bold tabular-nums ${pctTone(totalPct)} cursor-help`}>
                {totalPctAvailable ? `${totalPct!.toFixed(1)}%` : "—"}
              </div>
            </TooltipTrigger>
            {!totalPctAvailable && (
              <TooltipContent side="left">
                <p>No payroll recorded for this period</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No labor or revenue data recorded for this month yet.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const isUnassigned = r.venue === "Unassigned";
              const available = pctAvailable(r.labor_cost_pct, r.labor_cost);
              return (
                <div key={r.venue} className="flex items-center gap-3 text-xs">
                  <div className={`w-24 truncate font-medium ${isUnassigned ? "text-muted-foreground" : ""}`}>
                    {isUnassigned ? (
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-dashed">
                        Unassigned
                      </Badge>
                    ) : (
                      r.venue
                    )}
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    {available ? (
                      <div
                        className={`h-full ${
                          (r.labor_cost_pct ?? 0) > 40
                            ? "bg-destructive"
                            : (r.labor_cost_pct ?? 0) > 30
                            ? "bg-warning"
                            : "bg-primary"
                        }`}
                        style={{ width: `${Math.min(100, r.labor_cost_pct ?? 0)}%` }}
                      />
                    ) : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`w-14 text-right tabular-nums font-semibold ${pctTone(r.labor_cost_pct)} cursor-help`}>
                        {available ? `${r.labor_cost_pct!.toFixed(1)}%` : "—"}
                      </div>
                    </TooltipTrigger>
                    {!available && (
                      <TooltipContent side="left">
                        <p>No payroll recorded for this period</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  <div className="hidden md:block w-28 text-right text-muted-foreground tabular-nums">
                    {fmtHKWhole(r.labor_cost)}
                  </div>
                  <div className="hidden md:block w-28 text-right text-muted-foreground tabular-nums">
                    {fmtHKWhole(r.revenue)}
                  </div>
                </div>
              );
            })}
            <div className="hidden md:grid grid-cols-[6rem_1fr_3.5rem_7rem_7rem] gap-3 text-[10px] uppercase tracking-widest text-muted-foreground pt-1 border-t border-border/60 mt-1">
              <div>Venue</div>
              <div />
              <div className="text-right">%</div>
              <div className="text-right">Labor</div>
              <div className="text-right">Revenue</div>
            </div>
          </div>
        )}
      </Card>
    </TooltipProvider>
  );
}
