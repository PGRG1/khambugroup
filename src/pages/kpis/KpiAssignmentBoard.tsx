import { useEffect, useMemo, useState } from "react";
import { useKpiCards, useKpiAssignments } from "@/hooks/useKpi";
import { useKpiBundles } from "@/hooks/useKpiBundles";
import { useVenues } from "@/hooks/useVenues";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, X, Package, Target, GripVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  const [pickedVenues, setPickedVenues] = useState<Set<string>>(new Set()); // "" = All Venues
  const [dragOverUser, setDragOverUser] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => setProfiles((data ?? []) as Profile[]));
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
      setDrop({ userId: p.user_id, userName: p.display_name ?? p.email ?? "user", payload });
      setPickedVenues(new Set([""])); // default to "All Venues"
    } catch {
      toast({ title: "Invalid drop payload", variant: "destructive" });
    }
  };

  const confirmAssign = async () => {
    if (!drop) return;
    const venueIds = pickedVenues.size === 0 ? [""] : Array.from(pickedVenues);
    let ok = true;
    for (const cardId of drop.payload.cardIds) {
      for (const v of venueIds) {
        // Skip duplicates
        const exists = assignments.some(
          (a) => a.kpi_card_id === cardId && a.assigned_user_id === drop.userId && (a.venue_id ?? "") === v && a.active,
        );
        if (exists) continue;
        const r = await create({
          kpi_card_id: cardId,
          assigned_user_id: drop.userId,
          venue_id: v || null,
        });
        if (!r) ok = false;
      }
    }
    if (ok) {
      toast({ title: `Assigned to ${drop.userName}` });
      setDrop(null);
      setPickedVenues(new Set());
      reload();
    }
  };

  const toggleVenue = (id: string) => {
    setPickedVenues((prev) => {
      const next = new Set(prev);
      if (id === "") {
        next.clear();
        next.add("");
        return next;
      }
      next.delete("");
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeCards = cards.filter((c) => c.active);
  const activeBundles = bundles.filter((b) => b.active);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-display tracking-tight">KPI Assignment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drag a card or bundle onto a user to assign. Click the × on a chip to unassign.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* LIBRARY */}
        <Card className="p-4 space-y-4 h-fit sticky top-4 card-glass">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
              <Package className="h-3.5 w-3.5" /> Bundles
            </div>
            <div className="space-y-1.5">
              {activeBundles.length === 0 && <div className="text-xs text-muted-foreground italic">No bundles yet</div>}
              {activeBundles.map((b) => {
                const cardIds = cardsInBundle(b.id);
                return (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={(e) =>
                      handleDragStart(e, { kind: "bundle", cardIds, label: b.name })
                    }
                    className="flex items-center gap-2 p-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 cursor-grab active:cursor-grabbing hover:bg-emerald-500/10 transition"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{b.name}</div>
                      <div className="text-[10px] text-muted-foreground">{cardIds.length} cards</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
              <Target className="h-3.5 w-3.5" /> Individual Cards
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {activeCards.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) =>
                    handleDragStart(e, { kind: "card", cardIds: [c.id], label: c.kpi_name })
                  }
                  className="flex items-center gap-2 p-2 rounded-md border border-zinc-800 bg-zinc-900/50 cursor-grab active:cursor-grabbing hover:bg-zinc-800/70 transition"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{c.kpi_name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.kpi_category}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* USERS */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProfiles.map((p) => {
              const userAssigns = assignmentsByUser.get(p.user_id) ?? [];
              const isOver = dragOverUser === p.user_id;
              return (
                <Card
                  key={p.user_id}
                  onDragOver={(e) => { e.preventDefault(); setDragOverUser(p.user_id); }}
                  onDragLeave={() => setDragOverUser((u) => (u === p.user_id ? null : u))}
                  onDrop={(e) => handleDrop(e, p)}
                  className={`p-3 card-glass transition border-2 ${
                    isOver ? "border-emerald-500/60 bg-emerald-500/5" : "border-transparent"
                  }`}
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
                      <div className="w-full text-center text-[11px] text-muted-foreground italic py-3 border border-dashed border-zinc-800 rounded">
                        Drop KPIs here
                      </div>
                    )}
                    {userAssigns.map((a) => (
                      <Badge
                        key={a.id}
                        variant="outline"
                        className="gap-1 pr-1 border-zinc-700 bg-zinc-900/60"
                      >
                        <span className="truncate max-w-[140px]">{cardById(a.kpi_card_id)?.kpi_name ?? "—"}</span>
                        <span className="text-[9px] text-muted-foreground">·{venueName(a.venue_id)}</span>
                        <button
                          onClick={() => remove(a.id)}
                          className="ml-0.5 rounded-sm hover:bg-rose-500/20 p-0.5"
                          title="Unassign"
                        >
                          <X className="h-3 w-3 text-rose-400" />
                        </button>
                      </Badge>
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

      {/* Venue picker dialog */}
      <Dialog open={!!drop} onOpenChange={(o) => !o && setDrop(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign {drop?.payload.kind === "bundle" ? "bundle" : "card"} "{drop?.payload.label}"
              {" → "}
              {drop?.userName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {drop?.payload.cardIds.length} card{drop?.payload.cardIds.length === 1 ? "" : "s"} will be assigned for
              the selected venue(s).
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleVenue("")}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  pickedVenues.has("")
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "border-zinc-700 text-muted-foreground hover:bg-zinc-800"
                }`}
              >
                All Venues
              </button>
              {activeVenues.map((v) => {
                const sel = pickedVenues.has(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleVenue(v.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      sel
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "border-zinc-700 text-muted-foreground hover:bg-zinc-800"
                    }`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrop(null)}>Cancel</Button>
            <Button onClick={confirmAssign} disabled={pickedVenues.size === 0}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
