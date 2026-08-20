import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { tonePill, type Tone } from "@/components/kpi/toneStyles";
import { StatusChip } from "@/components/kpi/KpiCleanCard";
import { useKpiSnapshots, URGENCY_RANK, relTime, type KpiScope, type KpiSnapshot } from "@/hooks/useKpiSnapshots";
import { useKpiAssignmentRows, type KpiAssignmentRow } from "@/hooks/useKpiAssignmentRows";
import { useKpiCapability } from "@/hooks/useKpiCapability";
import { useKpiActions, type KpiActionStatus } from "@/hooks/useKpi";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "__all__", label: "All statuses" },
  { value: "danger", label: "Needs Attention" },
  { value: "warn", label: "At Risk" },
  { value: "success", label: "On Track" },
  { value: "awaiting", label: "Awaiting Update" },
];

export default function TeamKpiView() {
  const cap = useKpiCapability();
  const { rows } = useKpiAssignmentRows();
  const { actions, create: createAction, update: updateAction, setStatus: setActionStatus } = useKpiActions();

  const [venueFilter, setVenueFilter] = useState("__all__");
  const [personFilter, setPersonFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showOnTrack, setShowOnTrack] = useState(false);

  // Visibility + venue permission gate. Incomplete assignments never leak here.
  const visibleRows: KpiAssignmentRow[] = useMemo(() => rows.filter((r) => {
    if (!r.ready) return false;
    if (!cap.canSeeVenue(r.venueId)) return false;
    const isOwner = r.assignment.assigned_user_id === cap.userId;
    if (r.visibility === "assignee_only") return isOwner || cap.canConfigure;
    if (r.visibility === "management") return isOwner || cap.canManageActions;
    return true;
  }), [rows, cap]);

  const rowByScope = useMemo(() => {
    const m = new Map<string, KpiAssignmentRow>();
    for (const r of visibleRows) if (!m.has(r.scopeKey)) m.set(r.scopeKey, r);
    return m;
  }, [visibleRows]);

  const scopes: KpiScope[] = useMemo(
    () => Array.from(rowByScope.values()).map((r) => ({ cardId: r.assignment.kpi_card_id, venueId: r.venueId })),
    [rowByScope],
  );

  const { snapshots, byKey, refreshAll, refreshing } = useKpiSnapshots(scopes, { persistAuto: cap.canManageActions });

  const entries = useMemo(() => {
    return Array.from(rowByScope.values()).map((r) => ({ row: r, snap: byKey.get(r.scopeKey) ?? null }))
      .filter((e): e is { row: KpiAssignmentRow; snap: KpiSnapshot } => !!e.snap);
  }, [rowByScope, byKey]);

  const counts = useMemo(() => {
    const c = { danger: 0, warn: 0, success: 0, awaiting: 0 };
    for (const e of entries) {
      if (e.snap.awaitingUpdate) c.awaiting++;
      if (e.snap.tone === "danger") c.danger++;
      else if (e.snap.tone === "warn" || e.snap.tone === "info") c.warn++;
      else if (e.snap.tone === "success") c.success++;
    }
    return c;
  }, [entries]);

  const venueOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.row.venueId ?? "__none__", e.row.venueName);
    return Array.from(m.entries());
  }, [entries]);

  const peopleOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.row.owner) m.set(e.row.owner.user_id, e.row.owner.display_name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const filtered = useMemo(() => {
    let arr = entries;
    if (venueFilter !== "__all__") arr = arr.filter((e) => (e.row.venueId ?? "__none__") === venueFilter);
    if (personFilter !== "__all__") arr = arr.filter((e) => e.row.owner?.user_id === personFilter);
    if (statusFilter !== "__all__") {
      if (statusFilter === "awaiting") arr = arr.filter((e) => e.snap.awaitingUpdate);
      else if (statusFilter === "warn") arr = arr.filter((e) => e.snap.tone === "warn" || e.snap.tone === "info");
      else arr = arr.filter((e) => e.snap.tone === statusFilter);
    }
    return [...arr].sort((a, b) => URGENCY_RANK[a.snap.tone] - URGENCY_RANK[b.snap.tone]);
  }, [entries, venueFilter, personFilter, statusFilter]);

  const exceptions = filtered.filter((e) => e.snap.tone !== "success");
  const onTrack = filtered.filter((e) => e.snap.tone === "success");

  useEffect(() => {
    if (selectedKey && filtered.some((e) => e.row.scopeKey === selectedKey)) return;
    setSelectedKey(filtered[0]?.row.scopeKey ?? null);
  }, [filtered, selectedKey]);

  const selected = filtered.find((e) => e.row.scopeKey === selectedKey) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatusChip label="Needs Attention" count={counts.danger} tone="danger" active={statusFilter === "danger"} onClick={() => setStatusFilter((s) => s === "danger" ? "__all__" : "danger")} />
        <StatusChip label="At Risk" count={counts.warn} tone="warn" active={statusFilter === "warn"} onClick={() => setStatusFilter((s) => s === "warn" ? "__all__" : "warn")} />
        <StatusChip label="On Track" count={counts.success} tone="success" active={statusFilter === "success"} onClick={() => setStatusFilter((s) => s === "success" ? "__all__" : "success")} />
        <StatusChip label="Awaiting Update" count={counts.awaiting} tone="neutral" active={statusFilter === "awaiting"} onClick={() => setStatusFilter((s) => s === "awaiting" ? "__all__" : "awaiting")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All permitted venues</SelectItem>
            {venueOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="w-48 h-9 text-xs"><SelectValue placeholder="Team member" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All team members</SelectItem>
            {peopleOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-9" onClick={refreshAll} disabled={refreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="rounded-xl border border-border card-glass p-8 text-center text-sm text-muted-foreground">
          No team KPIs are visible to you for your permitted venues.
        </div>
      )}

      {entries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
          {/* Exceptions */}
          <div className="rounded-xl border border-border/60 card-glass overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              Team Exceptions
            </div>
            <div className="divide-y divide-border/40">
              {exceptions.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                  No exceptions right now.
                </div>
              )}
              {exceptions.map((e) => (
                <TeamRow key={e.row.scopeKey} entry={e} active={selectedKey === e.row.scopeKey} onSelect={() => setSelectedKey(e.row.scopeKey)} />
              ))}
            </div>

            {onTrack.length > 0 && (
              <div className="border-t border-border/50">
                <button type="button" onClick={() => setShowOnTrack((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40">
                  {showOnTrack ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  On track ({onTrack.length})
                </button>
                {showOnTrack && (
                  <div className="divide-y divide-border/40">
                    {onTrack.map((e) => (
                      <TeamRow key={e.row.scopeKey} entry={e} active={selectedKey === e.row.scopeKey} onSelect={() => setSelectedKey(e.row.scopeKey)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail + action */}
          <DetailPanel
            entry={selected}
            actions={actions}
            cap={cap}
            onCreate={createAction}
            onUpdate={updateAction}
            onStatus={setActionStatus}
          />
        </div>
      )}
    </div>
  );
}

function TeamRow({ entry, active, onSelect }: { entry: { row: KpiAssignmentRow; snap: KpiSnapshot }; active: boolean; onSelect: () => void }) {
  const { row, snap } = entry;
  return (
    <button type="button" onClick={onSelect}
      className={cn("w-full text-left px-4 py-3 transition grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-2 items-center",
        active ? "bg-primary/[0.06]" : "hover:bg-muted/40")}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate">{snap.card.kpi_name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {row.owner?.display_name ?? "Unassigned"}
          {row.owner?.job_title ? ` · ${row.owner.job_title}` : ""} · {row.venueName}
        </div>
      </div>
      <div className="text-[12px] tabular-nums text-muted-foreground truncate">
        <span className="text-foreground">{snap.heroValue}</span>
        <span className="mx-1">/</span>
        <span>{snap.requiredLabel}</span>
      </div>
      <div className="flex items-center gap-2 justify-start sm:justify-end">
        <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap", tonePill[snap.tone])}>
          {snap.statusLabel}
        </span>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {snap.updatedAt ? relTime(snap.updatedAt) : "no update"}
        </span>
      </div>
    </button>
  );
}

function DetailPanel({ entry, actions, cap, onCreate, onUpdate, onStatus }: {
  entry: { row: KpiAssignmentRow; snap: KpiSnapshot } | null;
  actions: ReturnType<typeof useKpiActions>["actions"];
  cap: ReturnType<typeof useKpiCapability>;
  onCreate: ReturnType<typeof useKpiActions>["create"];
  onUpdate: ReturnType<typeof useKpiActions>["update"];
  onStatus: ReturnType<typeof useKpiActions>["setStatus"];
}) {
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { setAdding(false); setDraft(""); setDue(""); setNote(""); }, [entry?.row.scopeKey]);

  if (!entry) {
    return (
      <div className="rounded-xl border border-border/60 card-glass p-6 text-[13px] text-muted-foreground">
        Select a KPI to see detail and actions.
      </div>
    );
  }

  const { row, snap } = entry;
  const action = actions.find(
    (a) => a.kpi_card_id === snap.cardId && (a.venue_id ?? null) === snap.venueId && a.action_status !== "done",
  ) ?? null;
  const isOwner = row.assignment.assigned_user_id === cap.userId;
  const canManage = cap.canManageActions && cap.canSeeVenue(row.venueId);
  const canProgress = canManage || (isOwner && !!action && action.assigned_user_id === cap.userId);

  const submit = async () => {
    if (!draft.trim()) return;
    const ok = await onCreate({
      kpi_card_id: snap.cardId,
      kpi_assignment_id: row.assignment.id,
      venue_id: snap.venueId,
      period_date: snap.periodDate,
      assigned_user_id: row.assignment.assigned_user_id,
      action_required: draft.trim(),
      due_date: due || null,
      notes: note || null,
    });
    if (ok) { setAdding(false); setDraft(""); setDue(""); setNote(""); }
  };

  return (
    <div className="rounded-xl border border-border/60 card-glass p-4 space-y-4 lg:sticky lg:top-4">
      <div>
        <div className="text-[13px] font-semibold font-display">{snap.card.kpi_name}</div>
        <div className="text-[11px] text-muted-foreground">
          {row.owner?.display_name ?? "Unassigned"}
          {row.owner?.job_title ? ` · ${row.owner.job_title}` : ""} · {row.venueName}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label={snap.heroLabel} value={snap.heroValue} />
        <Metric label="Required" value={snap.requiredLabel} />
        <Metric label="Status" value={snap.statusLabel} />
        <Metric label="Gap" value={snap.gapText ?? "—"} />
      </div>

      <div className="text-[11px] text-muted-foreground">{snap.footerLeft}</div>

      <div className="border-t border-border/50 pt-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current action</div>
        {!action && <div className="text-[12px] text-muted-foreground">No open action.</div>}
        {action && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-2">
            <div className="text-[12px] leading-snug">{action.action_required}</div>
            <div className="text-[11px] text-muted-foreground">
              Owner: {row.owner?.display_name ?? "—"}
              {action.due_date ? ` · Due ${action.due_date}` : ""}
            </div>
            {action.notes && <div className="text-[11px] text-muted-foreground">{action.notes}</div>}
            <div className="flex flex-wrap gap-1.5">
              {(["open", "in_progress", "done"] as KpiActionStatus[]).map((s) => (
                <Button key={s} size="sm" variant={action.action_status === s ? "default" : "outline"}
                  className="h-8 px-2.5 text-[11px]" disabled={!canProgress}
                  onClick={() => onStatus(action.id, s)}>
                  {s === "open" ? "Open" : s === "in_progress" ? "In progress" : "Complete"}
                </Button>
              ))}
              {canManage && (
                <Button size="sm" variant="ghost" className="h-8 px-2.5 text-[11px]"
                  onClick={() => onUpdate(action.id, { assigned_user_id: row.assignment.assigned_user_id })}>
                  Reassign to owner
                </Button>
              )}
            </div>
          </div>
        )}

        {canManage && !adding && (
          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /><span>{action ? "Add another action" : "Create action"}</span>
          </Button>
        )}

        {canManage && adding && (
          <div className="space-y-2">
            <div>
              <Label className="text-[11px]">Required action</Label>
              <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Due date</Label>
              <Input type="date" className="h-9" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Notes (optional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-[11px]" onClick={submit}>Save action</Button>
              <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className="text-[13px] font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}
