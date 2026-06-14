import { useEffect, useMemo, useState } from "react";
import { useKpiCards, useKpiTargets, useKpiAssignments, type KpiTarget, type KpiAssignment } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Settings2, Search, Users, Target as TargetIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Profile { user_id: string; display_name: string | null; email?: string | null }

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function KpiManage() {
  const { cards, loading: cardsLoading } = useKpiCards();
  const { targets, create: createTarget, update: updateTarget, remove: removeTarget } = useKpiTargets();
  const { assignments, create: createAssignment, remove: removeAssignment } = useKpiAssignments();
  const { venues } = useVenues();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [advanced, setAdvanced] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);
  const activeCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = cards.filter((c) => c.active);
    if (q) list = list.filter((c) => c.kpi_name.toLowerCase().includes(q) || c.kpi_category.toLowerCase().includes(q));
    return list;
  }, [cards, search]);

  const toggle = (id: string, set: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const findTarget = (cardId: string, venueId: string | null, dow: number | null = null) =>
    targets.find(
      (t) =>
        t.active &&
        t.kpi_card_id === cardId &&
        (t.venue_id ?? null) === venueId &&
        (t.day_of_week ?? null) === dow &&
        (dow === null ? t.calculation_method !== "day_of_week" : t.calculation_method === "day_of_week"),
    );

  const saveTargetValue = async (
    cardId: string,
    venueId: string | null,
    rawValue: string,
    dow: number | null = null,
  ) => {
    const existing = findTarget(cardId, venueId, dow);
    const value = parseFloat(rawValue);
    if (rawValue === "" || Number.isNaN(value)) {
      if (existing) await removeTarget(existing.id);
      return;
    }
    if (existing) {
      if (Number(existing.target_value) !== value) await updateTarget(existing.id, { target_value: value });
    } else {
      await createTarget({
        kpi_card_id: cardId,
        venue_id: venueId,
        target_value: value,
        target_period: "day",
        calculation_method: dow === null ? "manual" : "day_of_week",
        day_of_week: dow,
        warning_threshold_pct: 10,
        critical_threshold_pct: 20,
      });
    }
  };

  const assignmentExists = (cardId: string, userId: string) =>
    assignments.find((a) => a.active && a.kpi_card_id === cardId && a.assigned_user_id === userId);

  const toggleAssignment = async (cardId: string, userId: string) => {
    const existing = assignmentExists(cardId, userId);
    if (existing) {
      await removeAssignment(existing.id);
    } else {
      await createAssignment({ kpi_card_id: cardId, assigned_user_id: userId, venue_id: null });
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Manage KPIs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set targets and assign people in one place. Click a card to expand.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search KPIs…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </header>

      {cardsLoading ? (
        <Card className="p-8 text-center text-muted-foreground">Loading…</Card>
      ) : activeCards.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No KPI cards.</Card>
      ) : (
        <div className="space-y-2">
          {activeCards.map((c) => {
            const isOpen = expanded.has(c.id);
            const isAdv = advanced.has(c.id);
            const assigneeCount = assignments.filter((a) => a.active && a.kpi_card_id === c.id).length;
            const targetCount = targets.filter((t) => t.active && t.kpi_card_id === c.id).length;
            return (
              <Card key={c.id} className="card-glass overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => toggle(c.id, expanded, setExpanded)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition text-left"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.kpi_name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {c.kpi_category.replace(/_/g, " ")} · {c.unit}
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 gap-1">
                    <TargetIcon className="h-3 w-3" /> {targetCount}
                  </Badge>
                  <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300 gap-1">
                    <Users className="h-3 w-3" /> {assigneeCount}
                  </Badge>
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-800 px-4 py-4 space-y-5 bg-zinc-950/40">
                    {/* Targets */}
                    <section>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <TargetIcon className="h-3.5 w-3.5" /> Daily Targets
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => toggle(c.id, advanced, setAdvanced)}
                        >
                          <Settings2 className="h-3.5 w-3.5 mr-1" />
                          {isAdv ? "Hide advanced" : "Advanced"}
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        <TargetCell
                          label="All Venues"
                          unit={c.unit}
                          initial={findTarget(c.id, null)?.target_value}
                          onSave={(v) => saveTargetValue(c.id, null, v)}
                        />
                        {activeVenues.map((v) => (
                          <TargetCell
                            key={v.id}
                            label={v.name}
                            unit={c.unit}
                            initial={findTarget(c.id, v.id)?.target_value}
                            onSave={(val) => saveTargetValue(c.id, v.id, val)}
                          />
                        ))}
                      </div>

                      {isAdv && (
                        <div className="mt-4 space-y-3">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Per Day-of-Week (overrides above)
                          </div>
                          <div className="grid grid-cols-7 gap-2">
                            {DOWS.map((d, idx) => (
                              <TargetCell
                                key={idx}
                                label={d}
                                unit={c.unit}
                                initial={findTarget(c.id, null, idx)?.target_value}
                                onSave={(val) => saveTargetValue(c.id, null, val, idx)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Assignees */}
                    <section>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Users className="h-3.5 w-3.5" /> Assigned People
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {profiles.length === 0 && (
                          <div className="text-xs text-muted-foreground italic">No users found.</div>
                        )}
                        {profiles
                          .sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""))
                          .map((p) => {
                            const assigned = !!assignmentExists(c.id, p.user_id);
                            return (
                              <button
                                key={p.user_id}
                                onClick={() => toggleAssignment(c.id, p.user_id)}
                                className={`px-2.5 py-1 rounded-full text-xs border transition ${
                                  assigned
                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
                                    : "border-zinc-700 text-muted-foreground hover:bg-zinc-800"
                                }`}
                              >
                                {p.display_name ?? p.email ?? p.user_id.slice(0, 6)}
                              </button>
                            );
                          })}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        Tip: clicking a name assigns this KPI for All Venues. For per-venue assignment, use the legacy
                        Assignment Board (still available at <code className="font-mono">/kpis/assignments</code>).
                      </div>
                    </section>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TargetCell({
  label,
  unit,
  initial,
  onSave,
}: {
  label: string;
  unit: string;
  initial: number | undefined;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState<string>(initial !== undefined && initial !== null ? String(initial) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initial !== undefined && initial !== null ? String(initial) : "");
  }, [initial]);

  const commit = async () => {
    if ((initial ?? "") === (value === "" ? "" : Number(value))) return;
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="relative">
        {unit === "currency" && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
        )}
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className={`h-9 font-mono ${unit === "currency" ? "pl-5" : ""} ${saving ? "opacity-60" : ""}`}
        />
      </div>
    </div>
  );
}
