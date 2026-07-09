import { useEffect, useMemo, useState } from "react";
import { useKpiCards, useKpiAssignments } from "@/hooks/useKpi";
import { useKpiBundles } from "@/hooks/useKpiBundles";
import { useVenues } from "@/hooks/useVenues";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, X, Package, Target, GripVertical, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BottomSheetDialog } from "@/components/kpi/BottomSheetDialog";

interface Profile { user_id: string; display_name: string | null; email?: string | null }

type DragPayload =
  | { kind: "card"; cardIds: string[]; label: string }
  | { kind: "bundle"; cardIds: string[]; label: string };

export default function KpiAssignmentBoard() {
  const { cards } = useKpiCards();
  const { assignments, create, remove, reload } = useKpiAssignments();
  const { bundles, cardsInBundle } = useKpiBundles();
  const { venues } = useVenues();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [drop, setDrop] = useState<null | { userId: string; userName: string; payload: DragPayload }>(null);
  const [pickedVenues, setPickedVenues] = useState<Set<string>>(new Set());
  const [dragOverUser, setDragOverUser] = useState<string | null>(null);
  const [selected, setSelected] = useState<null | { key: string; payload: DragPayload }>(null);

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);
  const cardById = (id: string) => cards.find((c) => c.id === id);
  const venueName = (id: string | null) => (id ? venues.find((v) => v.id === id)?.name ?? "—" : "All Venues");

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...profiles].sort((a, b) =>
      (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? ""),
    );
    if (!q) return sorted;
    return sorted.filter((p) => (p.display_name ?? p.email ?? "").toLowerCase().includes(q));
  }, [profiles, search]);

  const assignmentsByUser = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments.filter((x) => x.active && x.assigned_user_id)) {
      const arr = map.get(a.assigned_user_id!) ?? [];
      arr.push(a);
      map.set(a.assigned_user_id!, arr);
    }
    return map;
  }, [assignments]);

  const handleDragStart = (e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };
  const handleDrop = (e: React.DragEvent, p: Profile) => {
    e.preventDefault();
    setDragOverUser(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData("application/json")) as DragPayload;
      openAssign(p, payload);
    } catch {
      toast({ title: "Invalid drop payload", variant: "destructive" });
    }
  };

  const openAssign = (p: Profile, payload: DragPayload) => {
    setDrop({ userId: p.user_id, userName: p.display_name ?? p.email ?? "user", payload });
    setPickedVenues(new Set([""]));
    setSelected(null);
  };

  const handleUserTap = (p: Profile) => {
    if (selected) openAssign(p, selected.payload);
  };

  const confirmAssign = async () => {
    if (!drop) return;
    const venueIds = pickedVenues.size === 0 ? [""] : Array.from(pickedVenues);
    let ok = true;
    for (const cardId of drop.payload.cardIds) {
      for (const v of venueIds) {
        const exists = assignments.some(
          (a) => a.kpi_card_id === cardId && a.assigned_user_id === drop.userId && (a.venue_id ?? "") === v && a.active,
        );
        if (exists) continue;
        const r = await create({ kpi_card_id: cardId, assigned_user_id: drop.userId, venue_id: v || null });
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

  const LibraryItem = ({
    payload, title, subtitle, tone,
  }: { payload: DragPayload; title: string; subtitle: string; tone: "bundle" | "card" }) => {
    const key = `${payload.kind}:${payload.cardIds.join(",")}`;
    const isSel = selected?.key === key;
    const onActivate = () => setSelected(isSel ? null : { key, payload });
    return (
      <div
        role="button" tabIndex={0}
        draggable
        onDragStart={(e) => handleDragStart(e, payload)}
        onClick={onActivate}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } }}
        className={cn(
          "flex items-center gap-2 p-2.5 rounded-md border transition cursor-pointer select-none",
          "hover:bg-muted/60 active:bg-muted",
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
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 pb-24">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold font-display tracking-tight">KPI Assignment</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Tap or drag a card / bundle, then tap a user to assign. Tap × on a chip to unassign.
        </p>
      </header>

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

        {/* USERS */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-10" placeholder="Search users…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProfiles.map((p) => {
              const userAssigns = assignmentsByUser.get(p.user_id) ?? [];
              const isOver = dragOverUser === p.user_id;
              const canTap = !!selected;
              return (
                <Card
                  key={p.user_id}
                  onDragOver={(e) => { e.preventDefault(); setDragOverUser(p.user_id); }}
                  onDragLeave={() => setDragOverUser((u) => (u === p.user_id ? null : u))}
                  onDrop={(e) => handleDrop(e, p)}
                  onClick={() => handleUserTap(p)}
                  className={cn(
                    "p-3 card-glass transition border-2 cursor-default",
                    isOver && "border-primary/60 bg-primary/5",
                    !isOver && canTap && "border-primary/40 cursor-pointer hover:bg-primary/[0.04]",
                    !isOver && !canTap && "border-transparent",
                  )}
                >
                  <div className="mb-2">
                    <div className="text-sm font-semibold truncate">
                      {p.display_name ?? p.email ?? p.user_id.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {userAssigns.length} assignment{userAssigns.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[48px]">
                    {userAssigns.length === 0 && (
                      <div className="w-full text-center text-[11px] text-muted-foreground italic py-3 border border-dashed border-border rounded">
                        {canTap ? "Tap to assign here" : "Drop or tap KPIs here"}
                      </div>
                    )}
                    {userAssigns.map((a) => (
                      <div key={a.id}
                        className="inline-flex items-center gap-1 pl-2 pr-0.5 py-0.5 rounded-md border border-border bg-card text-[11px]">
                        <span className="truncate max-w-[140px]">{cardById(a.kpi_card_id)?.kpi_name ?? "—"}</span>
                        <span className="text-[9px] text-muted-foreground">·{venueName(a.venue_id)}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); remove(a.id); }}
                          className="ml-0.5 rounded p-1 hover:bg-destructive/15 min-w-[28px] min-h-[28px] flex items-center justify-center"
                          title="Unassign"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            {filteredProfiles.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-8">No users match.</div>
            )}
          </div>
        </div>
      </div>

      {/* Floating select bar */}
      {selected && (
        <div className="fixed bottom-3 inset-x-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-4 z-40 rounded-full border border-primary/40 bg-card shadow-lg px-3 py-2 flex items-center gap-3">
          <span className="text-xs font-medium truncate max-w-[240px]">
            Assigning: <span className="text-primary">{selected.payload.label}</span> — tap a user
          </span>
          <button onClick={() => setSelected(null)} className="rounded-full hover:bg-muted p-1.5" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Venue picker */}
      <BottomSheetDialog open={!!drop} onOpenChange={(o) => !o && setDrop(null)}>
        <DialogHeader>
          <DialogTitle className="text-base">
            Assign {drop?.payload.kind === "bundle" ? "bundle" : "card"} "{drop?.payload.label}"
            {" → "}{drop?.userName}
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
    <button
      type="button" onClick={onClick}
      className={cn(
        "min-h-10 px-3 rounded-full text-xs border transition",
        active
          ? "bg-primary/15 border-primary/50 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >{children}</button>
  );
}
