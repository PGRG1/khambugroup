import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useKpiCards, useKpiTargets, useKpiAssignments, useKpiActuals, useKpiActions } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { computeKpiStatus } from "@/utils/kpiStatus";
import { computeAutoActual, isAutoKpiType } from "@/utils/kpiAutoActual";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Clock, RefreshCw } from "lucide-react";

const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  info: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  danger: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  neutral: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

function fmt(v: number | null, unit: string) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (unit === "currency") return `HK$ ${Math.round(v).toLocaleString()}`;
  if (unit === "percent") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function currentPeriodDate(kpi_type: string): string {
  const now = new Date();
  if (kpi_type === "mtd_revenue") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

export default function MyKpis() {
  const { user, isAdmin } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const uid = isPreviewActive && isAdmin ? previewUserId : user?.id;

  const { cards } = useKpiCards();
  const { targets } = useKpiTargets();
  const { assignments } = useKpiAssignments();
  const { actuals, upsert } = useKpiActuals();
  const { actions } = useKpiActions();
  const { venues } = useVenues();

  const [editing, setEditing] = useState<null | { cardId: string; venueId: string | null; periodDate: string; current?: number }>(null);
  const [actualInput, setActualInput] = useState("");
  const [notes, setNotes] = useState("");

  const venueName = (id: string | null) => venues.find((v) => v.id === id)?.name ?? "All Venues";
  const cardById = (id: string) => cards.find((c) => c.id === id);

  // Determine which (card, venue) tiles to render for this user
  const tiles = useMemo(() => {
    const myAssignments = isAdmin && !isPreviewActive
      ? assignments.filter((a) => a.active)
      : assignments.filter((a) => a.active && (a.assigned_user_id === uid || a.assigned_user_id === null));
    const grouped = new Map<string, { cardId: string; venueId: string | null }>();
    for (const a of myAssignments) {
      const key = `${a.kpi_card_id}__${a.venue_id ?? ""}`;
      if (!grouped.has(key)) grouped.set(key, { cardId: a.kpi_card_id, venueId: a.venue_id });
    }
    return Array.from(grouped.values());
  }, [assignments, uid, isAdmin, isPreviewActive]);

  const handleSave = async () => {
    if (!editing) return;
    const val = parseFloat(actualInput);
    if (Number.isNaN(val)) return;
    const ok = await upsert({
      kpi_card_id: editing.cardId,
      venue_id: editing.venueId,
      period_date: editing.periodDate,
      actual_value: val,
      notes,
    });
    if (ok) {
      setEditing(null);
      setActualInput("");
      setNotes("");
    }
  };

  const refreshAutoActual = async (cardId: string, venueId: string | null, periodDate: string) => {
    const card = cardById(cardId);
    if (!card || !isAutoKpiType(card.kpi_type)) return;
    const vName = venueId ? venues.find((v) => v.id === venueId)?.name ?? null : null;
    try {
      const val = await computeAutoActual(card.kpi_type, vName, periodDate);
      await upsert({
        kpi_card_id: cardId,
        venue_id: venueId,
        period_date: periodDate,
        actual_value: val,
        actual_source: "sales_data_auto",
      });
    } catch (e) {
      // silently skip — surfaced via toast inside upsert if it fails
    }
  };

  // Auto-pull on first render for any tiles backed by sales_data
  useEffect(() => {
    if (!tiles.length || !cards.length) return;
    tiles.forEach(({ cardId, venueId }) => {
      const card = cardById(cardId);
      if (!card || !isAutoKpiType(card.kpi_type)) return;
      const periodDate = currentPeriodDate(card.kpi_type);
      const existing = actuals.find(
        (a) => a.kpi_card_id === cardId && (a.venue_id ?? null) === venueId && a.period_date === periodDate,
      );
      // Refresh if missing, or if last update is older than 30 min
      const stale = !existing || (Date.now() - new Date(existing.updated_at).getTime() > 30 * 60 * 1000);
      if (stale) refreshAutoActual(cardId, venueId, periodDate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.length, cards.length]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-display tracking-tight">My KPI Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">
          You are responsible for {tiles.length} KPI {tiles.length === 1 ? "card" : "cards"}.
        </p>
      </header>

      {tiles.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          No KPI cards assigned to you yet. Ask an admin to assign cards in <strong>KPI Management → Assignment</strong>.
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(({ cardId, venueId }) => {
          const card = cardById(cardId);
          if (!card) return null;
          const periodDate = currentPeriodDate(card.kpi_type);

          // Find best matching target
          const cardTargets = targets.filter(
            (t) => t.active && t.kpi_card_id === cardId && (t.venue_id === venueId || t.venue_id === null),
          );
          const today = new Date();
          const dow = today.getDay();
          let target = cardTargets.find((t) => t.calculation_method === "day_of_week" && t.day_of_week === dow && t.venue_id === venueId)
            ?? cardTargets.find((t) => t.venue_id === venueId)
            ?? cardTargets[0];

          const actual = actuals.find((a) => a.kpi_card_id === cardId && (a.venue_id ?? null) === venueId && a.period_date === periodDate);
          const targetValue = target?.target_value ?? 0;
          const status = computeKpiStatus({
            target: targetValue,
            actual: actual ? actual.actual_value : null,
            warningPct: target?.warning_threshold_pct ?? 10,
            criticalPct: target?.critical_threshold_pct ?? 20,
            higherIsBetter: true,
          });

          const openAction = actions.find(
            (ac) => ac.kpi_card_id === cardId && (ac.venue_id ?? null) === venueId && ac.action_status !== "done",
          );

          const remaining = actual && targetValue > 0 ? Math.max(0, targetValue - actual.actual_value) : null;
          const progressPct = actual && targetValue > 0 ? Math.min(100, (actual.actual_value / targetValue) * 100) : 0;

          return (
            <Card key={`${cardId}-${venueId ?? "all"}`} className="p-5 space-y-4 border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{venueName(venueId)}</div>
                  <h3 className="text-base font-semibold truncate">{card.kpi_name}</h3>
                </div>
                <Badge variant="outline" className={TONE_CLASS[status.tone]}>{status.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</div>
                  <div className="text-lg font-mono">{fmt(targetValue, card.unit)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Actual</div>
                  <div className="text-lg font-mono">
                    {actual ? fmt(actual.actual_value, card.unit) : <span className="text-muted-foreground italic text-sm">Not updated yet</span>}
                  </div>
                </div>
              </div>

              {actual && targetValue > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{progressPct.toFixed(0)}% of target</span>
                    {remaining !== null && remaining > 0 && <span>{fmt(remaining, card.unit)} to go</span>}
                  </div>
                </div>
              )}

              {status.variance !== null && (
                <div className="flex items-center gap-2 text-sm">
                  {status.variance > 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> :
                    status.variance < 0 ? <TrendingDown className="h-4 w-4 text-rose-400" /> :
                    <Minus className="h-4 w-4 text-muted-foreground" />}
                  <span className={status.variance >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {status.variance >= 0 ? "+" : ""}{fmt(status.variance, card.unit)}
                    {status.variancePct !== null && ` (${status.variancePct >= 0 ? "+" : ""}${status.variancePct.toFixed(1)}%)`}
                  </span>
                </div>
              )}

              {openAction && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                  <div className="font-semibold text-amber-400">Action required</div>
                  <div className="text-muted-foreground mt-0.5">{openAction.action_required}</div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {actual ? `Updated ${relTime(actual.updated_at)}` : "Awaiting first update"}
                </div>
                {isAutoKpiType(card.kpi_type) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshAutoActual(cardId, venueId, periodDate)}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh from Sales
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing({ cardId, venueId, periodDate, current: actual?.actual_value });
                      setActualInput(actual ? String(actual.actual_value) : "");
                      setNotes(actual?.notes ?? "");
                    }}
                  >
                    Update Actual
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Actual Value</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {cardById(editing.cardId)?.kpi_name} — {venueName(editing.venueId)} — {editing.periodDate}
              </div>
              <div>
                <Label>Actual value</Label>
                <Input type="number" step="0.01" value={actualInput} onChange={(e) => setActualInput(e.target.value)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
