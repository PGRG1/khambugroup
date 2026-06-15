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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings2, Trash2, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  const [advanced, setAdvanced] = useState<KpiTarget | null>(null);

  const activeCards = useMemo(() => cards.filter(c => c.active), [cards]);
  const activeVenues = useMemo(() => venues.filter(v => v.is_active), [venues]);

  // Build grid rows: one row per active KPI for the selected venue scope
  const rows = useMemo(() => {
    const venueId = venueFilter === ALL ? null : venueFilter;
    return activeCards.map(card => {
      // Cost KPIs (food/beverage/supplies) are always monthly, regardless of the period filter.
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
    if (raw === "" || !Number.isFinite(value)) {
      toast({ title: "Enter a number", variant: "destructive" });
      return;
    }
    setSavingKey(key);
    if (existing) {
      await update(existing.id, { target_value: value });
    } else {
      await create({
        kpi_card_id: cardId,
        venue_id: venueId,
        target_value: value,
        target_period: effectivePeriod,
        calculation_method: "manual",
        warning_threshold_pct: 10,
        critical_threshold_pct: 20,
        active: true,
      });
    }
    setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
    setSavingKey(null);
  };

  const venueLabel = venueFilter === ALL ? "All Venues" : (activeVenues.find(v => v.id === venueFilter)?.name ?? "—");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">KPI Targets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Type a value next to each KPI and press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Enter</kbd> to save.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Venue</Label>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Venues</SelectItem>
                {activeVenues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <Card>
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
                <TableRow key={card.id}>
                  <TableCell className="font-medium">
                    {card.kpi_name}
                    {isCost && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/80">cost · monthly</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground capitalize">{card.unit}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="—"
                        value={display}
                        onChange={(e) => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v === "" || v === (existing ? String(existing.target_value) : "")) return;
                          saveValue(card.id, venueId, v, effectivePeriod, existing);
                        }}
                        className="max-w-40 font-mono"
                        disabled={savingKey === key}
                      />
                      <span className="text-xs text-muted-foreground">{suffix}</span>
                      {savingKey === key && <Check className="h-4 w-4 text-emerald-400 animate-pulse" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isCost ? (
                      <Select
                        value={mode}
                        onValueChange={(v) => existing && update(existing.id, { target_mode: v as any })}
                        disabled={!existing}
                      >
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
                    <Switch
                      checked={existing?.active ?? false}
                      disabled={!existing}
                      onCheckedChange={(v) => existing && update(existing.id, { active: v })}
                    />
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
                          <Trash2 className="h-4 w-4 text-rose-400" />
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

  // sync when opening
  useMemo(() => {
    if (target) {
      setWarn(String(target.warning_threshold_pct));
      setCrit(String(target.critical_threshold_pct));
      setDow(target.day_of_week !== null ? String(target.day_of_week) : "none");
    }
  }, [target?.id]);

  if (!target) return null;

  const handleSave = async () => {
    const ok = await onSave(target.id, {
      warning_threshold_pct: parseFloat(warn) || 10,
      critical_threshold_pct: parseFloat(crit) || 20,
      day_of_week: dow === "none" ? null : parseInt(dow, 10),
      calculation_method: dow === "none" ? "manual" : "day_of_week",
    });
    if (ok) onClose();
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Advanced options</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Warning %</Label>
              <Input type="number" value={warn} onChange={(e) => setWarn(e.target.value)} />
            </div>
            <div>
              <Label>Critical %</Label>
              <Input type="number" value={crit} onChange={(e) => setCrit(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Day of week (optional)</Label>
            <Select value={dow} onValueChange={setDow}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any day</SelectItem>
                {DOWS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Restricts this target to a specific weekday.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
