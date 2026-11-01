import { useEffect, useMemo, useState } from "react";
import { useKpiCards, type KpiVisibility } from "@/hooks/useKpi";
import { useKpiAssignmentRows } from "@/hooks/useKpiAssignmentRows";
import { useKpiBundles } from "@/hooks/useKpiBundles";
import { useVenues } from "@/hooks/useVenues";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, X, Package, Target, GripVertical, Check, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BottomSheetDialog } from "@/components/kpi/BottomSheetDialog";
import type { KpiPerson } from "@/hooks/useKpiPeople";

type DragPayload =
  | { kind: "card"; cardIds: string[]; label: string }
  | { kind: "bundle"; cardIds: string[]; label: string };

const VISIBILITY_LABEL: Record<KpiVisibility, string> = {
  team: "Team",
  management: "Management",
  assignee_only: "Assignee only",
};

export default function KpiAssignmentBoard({ embedded = false, onOpenTargets }: {
  embedded?: boolean;
  onOpenTargets?: () => void;
} = {}) {
  const { cards } = useKpiCards();
  const { rows, people, create, remove, update, reload } = useKpiAssignmentRows();
  const { bundles, cardsInBundle } = useKpiBundles();
  const { venues } = useVenues();

  const [search, setSearch] = useState("");
  const [drop, setDrop] = useState<null | { userId: string; userName: string; payload: DragPayload }>(null);
  const [pickedVenues, setPickedVenues] = useState<Set<string>>(new Set());
  const [dragOverUser, setDragOverUser] = useState<string | null>(null);
  const [selected, setSelected] = useState<null | { key: string; payload: DragPayload }>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.display_name.toLowerCase().includes(q) || (p.job_title ?? "").toLowerCase().includes(q));
  }, [people, search]);

  const rowsByUser = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows.filter((x) => x.assignment.active && x.assignment.assigned_user_id)) {
      const uid = r.assignment.assigned_user_id!;
      const arr = map.get(uid) ?? [];
      arr.push(r);
      map.set(uid, arr);
    }
    return map;
  }, [rows]);

  const incomplete = useMemo(() => rows.filter((r) => r.assignment.active && !r.ready), [rows]);

  const handleDragStart = (e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };
  const handleDrop = (e: React.DragEvent, p: KpiPerson) => {
    e.preventDefault();
    setDragOverUser(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData("application/json")) as DragPayload;
      openAssign(p, payload);
    } catch {
      toast({ title: "Invalid drop payload", variant: "destructive" });
    }
  };

  const openAssign = (p: KpiPerson, payload: DragPayload) => {
    setDrop({ userId: p.user_id, userName: p.display_name, payload });
    setPickedVenues(new Set([""]));
    setSelected(null);
  };

  const confirmAssign = async () => {
    if (!drop) return;
    const venueIds = pickedVenues.size === 0 ? [""] : Array.from(pickedVenues);
    let ok = true;
    for (const cardId of drop.payload.cardIds) {
      for (const v of venueIds) {
        const exists = rows.some(
          (r) => r.assignment.kpi_card_id === cardId && r.assignment.assigned_user_id === drop.userId
            && (r.venueId ?? "") === v && r.assignment.active,
        );
        if (exists) continue;
        const r = await create({ kpi_card_id: cardId, assigned_user_id: drop.userId, venue_id: v || null, visibility_scope: "team" });
        if (!r) ok = false;
      }
    }
    if (ok) {
      toast({ title: `Assigned to ${drop.userName}` });
      setDrop(null); setPickedVenues(new Set()); reload();
    }
  };

  const toggleVenue = (id: string) => {
    setPickedVenues((prev) => {
      const next = new Set(prev);
      if (id === "") { next.clear(); next.add(""); return next; }
      next.delete("");
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeCards = cards.filter((c) => c.active);
  const activeBundles = bundles.filter((b) => b.active);

  const LibraryItem = ({ payload, title, subtitle, tone }: { payload: DragPayload; title: string; subtitle: string; tone: "bundle" | "card" }) => {
    const key = `${payload.kind}:${payload.cardIds.join(",")}`;
    const isSel = selected?.key === key;
    const onActivate = () => setSelected(isSel ? null : { key, payload });
    return (
      <div
        role="button" tabIndex={0} draggable
        onDragStart={(e) => handleDragStart(e, payload)}
        onClick={onActivate}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } }}
        className={cn(
          "flex items-center gap-2 p-2.5 rounded-md border transition cursor-pointer select-none hover:bg-muted/60 active:bg-muted",
          tone === "bundle" ? "border-primary/30 bg-primary/5" : "border-border bg-card",
          isSel && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
        </div>
        {isSel && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
      </div>
    );
  };

  return (
    <div className={embedded ? "space-y-5 pb-24" : "p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 pb-24"}>
      {!embedded && (
        <header>
          <h1 className="text-xl sm:text-2xl font-semibold font-display tracking-tight">KPI Assignment</h1>
        </header>
      )}
      <p className="text-[13px] text-muted-foreground">
        Every usable KPI belongs to one named person. Tap or drag a card / bundle, then tap a person to assign.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* LIBRARY */}
        <Card className="p-4 space-y-4 card-glass border-border/60 lg:h-fit lg:sticky lg:top-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
              <Package className="h-3.5 w-3.5" /> Bundles
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5">
              {activeBundles.length === 0 && <div className="text-xs text-muted-foreground italic">No bundles yet</div>}
              {activeBundles.map((b) => (
                <LibraryItem key={b.id}
                  payload={{ kind: "bundle", cardIds: cardsInBundle(b.id), label: b.name }}
                  title={b.name} subtitle={`${cardsInBundle(b.id).length} cards`} tone="bundle" />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
              <Target className="h-3.5 w-3.5" /> Individual Cards
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5 lg:max-h-[60vh] lg:overflow-y-auto">
              {activeCards.map((c) => (
                <LibraryItem key={c.id}
                  payload={{ kind: "card", cardIds: [c.id], label: c.kpi_name }}
                  title={c.kpi_name} subtitle={c.kpi_category} tone="card" />
              ))}
            </div>
          </div>
        </Card>

        {/* PEOPLE */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-10" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredPeople.map((p) => {
              const userRows = rowsByUser.get(p.user_id) ?? [];
              const isOver = dragOverUser === p.user_id;
              const canTap = !!selected;
              return (
                <Card
                  key={p.user_id}
                  onDragOver={(e) => { e.preventDefault(); setDragOverUser(p.user_id); }}
                  onDragLeave={() => setDragOverUser((u) => (u === p.user_id ? null : u))}
                  onDrop={(e) => handleDrop(e, p)}
                  onClick={() => { if (selected) openAssign(p, selected.payload); }}
                  className={cn(
                    "p-3 card-glass transition border-2 cursor-default",
                    isOver && "border-primary/60 bg-primary/5",
                    !isOver && canTap && "border-primary/40 cursor-pointer hover:bg-primary/[0.04]",
                    !isOver && !canTap && "border-transparent",
                  )}
                >
                  <div className="mb-2 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.display_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.job_title ? `${p.job_title} · ` : ""}{userRows.length} assignment{userRows.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="space-y-1.5 min-h-[48px]">
                    {userRows.length === 0 && (
                      <div className="w-full text-center text-[11px] text-muted-foreground italic py-3 border border-dashed border-border rounded">
                        {canTap ? "Tap to assign here" : "Drop or tap KPIs here"}
                      </div>
                    )}
                    {userRows.map((r) => (
                      <div key={r.assignment.id} className="rounded-md border border-border bg-card px-2 py-1.5 text-[11px] min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate flex-1 min-w-0">{r.card?.kpi_name ?? "—"}</span>
                          <span className="text-[9px] text-muted-foreground truncate max-w-[70px] shrink-0">·{r.venueName}</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); remove(r.assignment.id); }}
                            className="ml-0.5 rounded p-1 hover:bg-destructive/15 min-w-[28px] min-h-[28px] flex items-center justify-center shrink-0"
                            title="Unassign">
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          <span className={cn(
                            "px-1.5 py-[1px] rounded text-[9px] font-semibold uppercase tracking-wide",
                            r.ready ? "bg-primary/12 text-primary" : "bg-warning/12 text-warning",
                          )}>{r.ready ? "Ready" : "Setup incomplete"}</span>
                          <Select value={r.visibility} onValueChange={(v) => update(r.assignment.id, { visibility_scope: v as KpiVisibility })}>
                            <SelectTrigger className="h-6 w-[112px] text-[10px] px-2"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(VISIBILITY_LABEL) as KpiVisibility[]).map((k) => (
                                <SelectItem key={k} value={k} className="text-xs">{VISIBILITY_LABEL[k]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {!r.ready && (
                          <div className="mt-1 text-[10px] text-warning break-words">{r.missing.join(" · ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            {filteredPeople.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-8 text-sm">
                No people in this client workspace match.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Incomplete assignments */}
      <div className="rounded-xl border border-border/60 card-glass overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Setup incomplete ({incomplete.length})
          </div>
          {onOpenTargets && (
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={onOpenTargets}>Open Targets</Button>
          )}
        </div>
        {incomplete.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-muted-foreground">Every active assignment is ready.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {incomplete.map((r) => (
              <div key={r.assignment.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] truncate">{r.card?.kpi_name ?? "Unknown KPI"} · {r.venueName}</div>
                  <div className="text-[11px] text-warning truncate">{r.missing.join(" · ")}</div>
                </div>
                {!r.hasTarget && onOpenTargets && (
                  <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={onOpenTargets}>Set target</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed bottom-3 inset-x-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-4 z-40 rounded-full border border-primary/40 bg-card shadow-lg px-3 py-2 flex items-center gap-3">
          <span className="text-xs font-medium truncate max-w-[240px]">
            Assigning: <span className="text-primary">{selected.payload.label}</span> — tap a person
          </span>
          <button onClick={() => setSelected(null)} className="rounded-full hover:bg-muted p-1.5" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <BottomSheetDialog open={!!drop} onOpenChange={(o) => !o && setDrop(null)}>
        <DialogHeader>
          <DialogTitle className="text-base">
            Assign {drop?.payload.kind === "bundle" ? "bundle" : "card"} "{drop?.payload.label}"{" → "}{drop?.userName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {drop?.payload.cardIds.length} card{drop?.payload.cardIds.length === 1 ? "" : "s"} will be assigned for the selected venue(s).
          </div>
          <div className="flex flex-wrap gap-2">
            <VenueChip active={pickedVenues.has("")} onClick={() => toggleVenue("")}>All Venues</VenueChip>
            {activeVenues.map((v) => (
              <VenueChip key={v.id} active={pickedVenues.has(v.id)} onClick={() => toggleVenue(v.id)}>{v.name}</VenueChip>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 sm:h-9" onClick={() => setDrop(null)}>Cancel</Button>
          <Button className="h-11 sm:h-9" onClick={confirmAssign} disabled={pickedVenues.size === 0}>Assign</Button>
        </DialogFooter>
      </BottomSheetDialog>
    </div>
  );
}

function VenueChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "min-h-10 px-3 rounded-full text-xs border transition",
        active ? "bg-primary/15 border-primary/50 text-primary" : "border-border text-muted-foreground hover:bg-muted",
      )}
    >{children}</button>
  );
}
