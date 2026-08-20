import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { BottomSheetDialog } from "@/components/kpi/BottomSheetDialog";
import { KpiCleanCard, StatusChip, VenuePill } from "@/components/kpi/KpiCleanCard";
import type { Tone } from "@/components/kpi/toneStyles";
import { useKpiSnapshots, URGENCY_RANK, type KpiScope } from "@/hooks/useKpiSnapshots";
import { useKpiAssignmentRows } from "@/hooks/useKpiAssignmentRows";
import { useKpiCapability } from "@/hooks/useKpiCapability";
import { useKpiActions } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { cn } from "@/lib/utils";

export default function MyKpiView() {
  const cap = useKpiCapability();
  const { rows } = useKpiAssignmentRows();
  const { actions } = useKpiActions();
  const { venues } = useVenues();

  const [venueFilter, setVenueFilter] = useState<string>("__all__");
  const [sortBy, setSortBy] = useState<"urgency" | "venue" | "name">("urgency");
  const [statusFilter, setStatusFilter] = useState<Tone | null>(null);
  const [editing, setEditing] = useState<null | { cardId: string; venueId: string | null; periodDate: string; title: string }>(null);
  const [actualInput, setActualInput] = useState("");
  const [notes, setNotes] = useState("");

  const venueName = (id: string | null) => (id ? venues.find((v) => v.id === id)?.name ?? "Unknown venue" : "All Venues");

  // Only Ready assignments owned by this exact person.
  const myRows = useMemo(
    () => rows.filter((r) => r.ready && r.assignment.assigned_user_id === cap.userId),
    [rows, cap.userId],
  );

  const scopes: KpiScope[] = useMemo(() => {
    const map = new Map<string, KpiScope>();
    for (const r of myRows) map.set(r.scopeKey, { cardId: r.assignment.kpi_card_id, venueId: r.venueId });
    return Array.from(map.values());
  }, [myRows]);

  const { snapshots, refreshOne, refreshAll, refreshing, upsertActual } = useKpiSnapshots(scopes, { persistAuto: true });

  const counts = useMemo(() => {
    const c = { success: 0, warn: 0, danger: 0, awaiting: 0 };
    for (const s of snapshots) {
      if (s.awaitingUpdate) c.awaiting++;
      if (s.tone === "success") c.success++;
      else if (s.tone === "warn" || s.tone === "info") c.warn++;
      else if (s.tone === "danger") c.danger++;
    }
    return c;
  }, [snapshots]);

  const venueOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of snapshots) set.add(s.venueId ?? "__all__");
    return Array.from(set);
  }, [snapshots]);

  const visible = useMemo(() => {
    let arr = snapshots;
    if (venueFilter !== "__all__") arr = arr.filter((s) => (s.venueId ?? "__all__") === venueFilter);
    if (statusFilter) {
      if (statusFilter === "warn") arr = arr.filter((s) => s.tone === "warn" || s.tone === "info");
      else if (statusFilter === "neutral") arr = arr.filter((s) => s.awaitingUpdate);
      else arr = arr.filter((s) => s.tone === statusFilter);
    }
    const sorted = [...arr];
    if (sortBy === "urgency") sorted.sort((a, b) => URGENCY_RANK[a.tone] - URGENCY_RANK[b.tone]);
    else if (sortBy === "venue") sorted.sort((a, b) => venueName(a.venueId).localeCompare(venueName(b.venueId)));
    else sorted.sort((a, b) => a.card.kpi_name.localeCompare(b.card.kpi_name));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots, venueFilter, statusFilter, sortBy, venues]);

  const handleSave = async () => {
    if (!editing) return;
    const val = parseFloat(actualInput);
    if (Number.isNaN(val)) return;
    const ok = await upsertActual({
      kpi_card_id: editing.cardId,
      venue_id: editing.venueId,
      period_date: editing.periodDate,
      actual_value: val,
      notes,
    });
    if (ok) { setEditing(null); setActualInput(""); setNotes(""); }
  };

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">
        You are responsible for {snapshots.length} KPI {snapshots.length === 1 ? "card" : "cards"}.
      </p>

      {snapshots.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2">
            <StatusChip label="On Track" count={counts.success} tone="success" active={statusFilter === "success"} onClick={() => setStatusFilter((s) => s === "success" ? null : "success")} />
            <StatusChip label="Warning" count={counts.warn} tone="warn" active={statusFilter === "warn"} onClick={() => setStatusFilter((s) => s === "warn" ? null : "warn")} />
            <StatusChip label="Critical" count={counts.danger} tone="danger" active={statusFilter === "danger"} onClick={() => setStatusFilter((s) => s === "danger" ? null : "danger")} />
            <StatusChip label="Needs Update" count={counts.awaiting} tone="neutral" active={statusFilter === "neutral"} onClick={() => setStatusFilter((s) => s === "neutral" ? null : "neutral")} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              <VenuePill active={venueFilter === "__all__"} onClick={() => setVenueFilter("__all__")}>All</VenuePill>
              {venueOptions.filter((v) => v !== "__all__").map((v) => (
                <VenuePill key={v} active={venueFilter === v} onClick={() => setVenueFilter(v)}>{venueName(v)}</VenuePill>
              ))}
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="urgency">Urgency</SelectItem>
                <SelectItem value="venue">Venue</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={refreshAll} disabled={refreshing} className="h-9">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              <span>Refresh all</span>
            </Button>
          </div>
        </>
      )}

      {snapshots.length === 0 && (
        <div className="rounded-xl border border-border card-glass p-8 text-center text-sm text-muted-foreground">
          No KPI cards are assigned to you yet. Ask an admin to assign and target one in <strong>KPI Setup</strong>.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {visible.map((s) => {
          const openAction = actions.find(
            (a) => a.kpi_card_id === s.cardId && (a.venue_id ?? null) === s.venueId && a.action_status !== "done",
          );
          return (
            <KpiCleanCard
              key={s.key}
              venue={venueName(s.venueId)}
              title={s.card.kpi_name}
              periodLabel={s.periodLabel}
              autoLabel={s.auto ? (s.kind === "cost" ? "auto · invoices" : "auto") : undefined}
              statusTone={s.tone}
              statusLabel={s.statusLabel}
              heroLabel={s.heroLabel}
              heroValue={s.heroValue}
              heroSub={s.heroSub}
              progressPct={s.progressPct}
              progressTone={s.tone}
              rows={s.rows}
              notice={openAction ? { tone: "warn", text: `Action: ${openAction.action_required}` } : s.notice}
              footerLeft={s.footerLeft}
              footerTone={s.awaitingUpdate ? "warn" : undefined}
              footerAction={s.manualEditable ? (
                <Button size="sm" className="min-h-11 sm:min-h-8 h-11 sm:h-8 px-4 text-xs" onClick={() => {
                  setEditing({ cardId: s.cardId, venueId: s.venueId, periodDate: s.periodDate, title: s.card.kpi_name });
                  setActualInput(s.actualValue !== null ? String(s.actualValue) : "");
                  setNotes("");
                }}>Update</Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => refreshOne(s.cardId, s.venueId)}>
                  <RefreshCw className="h-3 w-3" /><span>Refresh</span>
                </Button>
              )}
            />
          );
        })}
      </div>

      <BottomSheetDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogHeader><DialogTitle>Update Actual Value</DialogTitle></DialogHeader>
        {editing && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {editing.title} — {venueName(editing.venueId)} — {editing.periodDate}
            </div>
            <div>
              <Label>Actual value</Label>
              <Input autoFocus type="number" inputMode="decimal" step="0.01"
                className="h-11 text-base tabular-nums"
                value={actualInput} onChange={(e) => setActualInput(e.target.value)} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11 sm:h-9" onClick={() => setEditing(null)}>Cancel</Button>
          <Button className="h-11 sm:h-9" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </BottomSheetDialog>
    </div>
  );
}
