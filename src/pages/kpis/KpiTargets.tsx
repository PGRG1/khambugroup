import { useMemo, useState } from "react";
import { useKpiCards, useKpiTargets, type KpiTarget } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings2, Trash2, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BottomSheetDialog } from "@/components/kpi/BottomSheetDialog";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL = "__all__";

export default function KpiTargets() {
  const { cards } = useKpiCards();
  const { targets, create, update, remove } = useKpiTargets();
  const { venues } = useVenues();

  const [venueFilter, setVenueFilter] = useState<string>(ALL);
  const [period, setPeriod] = useState<string>("day");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<KpiTarget | null>(null);

  const activeCards = useMemo(() => cards.filter(c => c.active), [cards]);
  const activeVenues = useMemo(() => venues.filter(v => v.is_active), [venues]);

  const rows = useMemo(() => {
    const venueId = venueFilter === ALL ? null : venueFilter;
    return activeCards.map(card => {
      const effectivePeriod = card.kpi_category === "cost" ? "month" : period;
      const existing = targets.find(t =>
        t.kpi_card_id === card.id &&
        (t.venue_id ?? null) === venueId &&
        t.target_period === effectivePeriod &&
        t.day_of_week === null
      );
      return { card, venueId, existing, effectivePeriod };
    });
  }, [activeCards, targets, venueFilter, period]);

  const keyFor = (cardId: string, venueId: string | null, effectivePeriod: string) => `${cardId}::${venueId ?? "all"}::${effectivePeriod}`;

  const saveValue = async (cardId: string, venueId: string | null, raw: string, effectivePeriod: string, existing?: KpiTarget) => {
    const key = keyFor(cardId, venueId, effectivePeriod);
    const value = parseFloat(raw);
    if (raw === "" || !Number.isFinite(value)) { toast({ title: "Enter a number", variant: "destructive" }); return; }
    setSavingKey(key);
    let ok = false;
    if (existing) ok = !!(await update(existing.id, { target_value: value }));
    else ok = !!(await create({
      kpi_card_id: cardId, venue_id: venueId, target_value: value, target_period: effectivePeriod,
      calculation_method: "manual", warning_threshold_pct: 10, critical_threshold_pct: 20, active: true,
    }));
    setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
    setSavingKey(null);
    if (ok) {
      setFlashKey(key);
      setTimeout(() => setFlashKey(k => k === key ? null : k), 800);
    }
  };

  const venueLabel = venueFilter === ALL ? "All Venues" : (activeVenues.find(v => v.id === venueFilter)?.name ?? "—");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold font-display tracking-tight">KPI Targets</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Type a value next to each KPI and press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Enter</kbd> to save.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:max-w-md gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Venue</Label>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Venues</SelectItem>
                {activeVenues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Desktop table */}
      <Card className="hidden md:block card-glass border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>KPI</TableHead>
              <TableHead className="hidden sm:table-cell text-muted-foreground">Unit</TableHead>
              <TableHead>Target ({venueLabel} · {period})</TableHead>
              <TableHead className="w-32">Mode</TableHead>
              <TableHead className="w-24 text-right">Active</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No active KPI cards.</TableCell></TableRow>
            )}
            {rows.map(({ card, venueId, existing, effectivePeriod }) => {
              const key = keyFor(card.id, venueId, effectivePeriod);
              const draft = drafts[key];
              const display = draft ?? (existing ? String(existing.target_value) : "");
              const isCost = card.kpi_category === "cost";
              const mode = (existing?.target_mode ?? "absolute") as "absolute" | "ratio_of_revenue";
              const suffix = mode === "ratio_of_revenue" ? "% of revenue" : (card.unit === "currency" ? "HK$" : card.unit);
              return (
                <TableRow key={card.id} className={cn("transition-colors", flashKey === key && "bg-primary/5")}>
                  <TableCell className="font-medium">
                    {card.kpi_name}
                    {isCost && <span className="ml-2 text-[10px] uppercase tracking-wider text-warning">cost · monthly</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground capitalize">{card.unit}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" step="0.01" inputMode="decimal" placeholder="—"
                        value={display}
                        onChange={(e) => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v === "" || v === (existing ? String(existing.target_value) : "")) return;
                          saveValue(card.id, venueId, v, effectivePeriod, existing);
                        }}
                        className="max-w-40 tabular-nums" disabled={savingKey === key}
                      />
                      <span className="text-xs text-muted-foreground">{suffix}</span>
                      {savingKey === key && <Check className="h-4 w-4 text-primary animate-pulse" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isCost ? (
                      <Select value={mode} onValueChange={(v) => existing && update(existing.id, { target_mode: v as any })} disabled={!existing}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="absolute">HK$ ceiling</SelectItem>
                          <SelectItem value="ratio_of_revenue">% of revenue</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">HK$</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={existing?.active ?? false} disabled={!existing}
                      onCheckedChange={(v) => existing && update(existing.id, { active: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {existing && (
                        <Button size="sm" variant="ghost" onClick={() => setAdvanced(existing)} title="Advanced options">
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      )}
                      {existing && (
                        <Button size="sm" variant="ghost" onClick={() => remove(existing.id)} title="Remove target">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">No active KPI cards.</div>
        )}
        {rows.map(({ card, venueId, existing, effectivePeriod }) => {
          const key = keyFor(card.id, venueId, effectivePeriod);
          const draft = drafts[key];
          const display = draft ?? (existing ? String(existing.target_value) : "");
          const isCost = card.kpi_category === "cost";
          const mode = (existing?.target_mode ?? "absolute") as "absolute" | "ratio_of_revenue";
          const suffix = mode === "ratio_of_revenue" ? "% rev" : (card.unit === "currency" ? "HK$" : card.unit);
          return (
            <div key={card.id} className={cn(
              "rounded-xl border border-border/60 card-glass p-3 space-y-2.5 transition-colors",
              flashKey === key && "bg-primary/5",
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{card.kpi_name}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {card.unit} · {venueLabel} · {effectivePeriod}
                  </div>
                </div>
                {isCost && <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-warning/10 text-warning ring-1 ring-warning/25">cost</span>}
              </div>

              <div className="relative">
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="—"
                  value={display}
                  onChange={(e) => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v === "" || v === (existing ? String(existing.target_value) : "")) return;
                    saveValue(card.id, venueId, v, effectivePeriod, existing);
                  }}
                  className="h-11 text-base tabular-nums pr-16 text-right"
                  disabled={savingKey === key}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {suffix}
                </span>
                {savingKey === key && (
                  <Check className="absolute right-14 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-pulse" />
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                {isCost && existing ? (
                  <Select value={mode} onValueChange={(v) => update(existing.id, { target_mode: v as any })}>
                    <SelectTrigger className="h-9 text-xs w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absolute">HK$ ceiling</SelectItem>
                      <SelectItem value="ratio_of_revenue">% of revenue</SelectItem>
                    </SelectContent>
                  </Select>
                ) : <div />}
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground pr-1">
                    <Switch checked={existing?.active ?? false} disabled={!existing}
                      onCheckedChange={(v) => existing && update(existing.id, { active: v })} />
                    Active
                  </label>
                  {existing && (
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setAdvanced(existing)}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  )}
                  {existing && (
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => remove(existing.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AdvancedDialog target={advanced} onClose={() => setAdvanced(null)} onSave={update} />
    </div>
  );
}

function AdvancedDialog({
  target, onClose, onSave,
}: {
  target: KpiTarget | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<KpiTarget>) => Promise<boolean>;
}) {
  const [warn, setWarn] = useState<string>("");
  const [crit, setCrit] = useState<string>("");
  const [dow, setDow] = useState<string>("none");

  useMemo(() => {
    if (target) {
      setWarn(String(target.warning_threshold_pct));
      setCrit(String(target.critical_threshold_pct));
      setDow(target.day_of_week !== null ? String(target.day_of_week) : "none");
    }
  }, [target?.id]);

  const handleSave = async () => {
    if (!target) return;
    const ok = await onSave(target.id, {
      warning_threshold_pct: parseFloat(warn) || 10,
      critical_threshold_pct: parseFloat(crit) || 20,
      day_of_week: dow === "none" ? null : parseInt(dow, 10),
      calculation_method: dow === "none" ? "manual" : "day_of_week",
    });
    if (ok) onClose();
  };

  return (
    <BottomSheetDialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogHeader><DialogTitle>Advanced options</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Warning %</Label>
            <Input type="number" inputMode="decimal" className="h-11 tabular-nums" value={warn} onChange={(e) => setWarn(e.target.value)} />
          </div>
          <div>
            <Label>Critical %</Label>
            <Input type="number" inputMode="decimal" className="h-11 tabular-nums" value={crit} onChange={(e) => setCrit(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Day of week (optional)</Label>
          <Select value={dow} onValueChange={setDow}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any day</SelectItem>
              {DOWS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Restricts this target to a specific weekday.</p>
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>Cancel</Button>
        <Button className="h-11 sm:h-9" onClick={handleSave}>Save</Button>
      </DialogFooter>
    </BottomSheetDialog>
  );
}
