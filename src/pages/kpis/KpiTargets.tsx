import { useState } from "react";
import { useKpiCards, useKpiTargets, type KpiTarget } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function KpiTargets() {
  const { cards } = useKpiCards();
  const { targets, create, update, remove } = useKpiTargets();
  const { venues } = useVenues();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<KpiTarget>>({
    target_period: "day", calculation_method: "manual", warning_threshold_pct: 10, critical_threshold_pct: 20, active: true,
  });
  const [dowValues, setDowValues] = useState<Record<number, string>>({});

  const cardName = (id: string) => cards.find(c => c.id === id)?.kpi_name ?? "—";
  const venueName = (id: string | null) => id ? (venues.find(v => v.id === id)?.name ?? "—") : "All Venues";

  const submit = async () => {
    if (!form.kpi_card_id) return toast({ title: "Select a KPI card", variant: "destructive" });
    if (form.calculation_method === "day_of_week") {
      let ok = true;
      for (let d = 0; d < 7; d++) {
        const v = parseFloat(dowValues[d] ?? "");
        if (!Number.isFinite(v)) continue;
        const r = await create({ ...form, target_value: v, day_of_week: d });
        if (!r) ok = false;
      }
      if (ok) closeReset();
    } else {
      const r = await create({ ...form, target_value: Number(form.target_value ?? 0) });
      if (r) closeReset();
    }
  };
  const closeReset = () => {
    setOpen(false);
    setForm({ target_period: "day", calculation_method: "manual", warning_threshold_pct: 10, critical_threshold_pct: 20, active: true });
    setDowValues({});
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">KPI Targets</h1>
          <p className="text-sm text-muted-foreground mt-1">Define targets per KPI, venue, and (optionally) day of week.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Target</Button>
      </header>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>KPI</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Warn / Crit %</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No targets defined yet.</TableCell></TableRow>
            )}
            {targets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{cardName(t.kpi_card_id)}</TableCell>
                <TableCell>{venueName(t.venue_id)}</TableCell>
                <TableCell className="capitalize">{t.target_period}</TableCell>
                <TableCell className="capitalize">{t.calculation_method.replace("_", " ")}</TableCell>
                <TableCell>{t.day_of_week !== null ? DOWS[t.day_of_week] : "—"}</TableCell>
                <TableCell className="text-right font-mono">{Number(t.target_value).toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">{t.warning_threshold_pct}% / {t.critical_threshold_pct}%</TableCell>
                <TableCell><Switch checked={t.active} onCheckedChange={(v) => update(t.id, { active: v })} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4 text-rose-400" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New KPI Target</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>KPI Card</Label>
              <Select value={form.kpi_card_id ?? ""} onValueChange={(v) => setForm({ ...form, kpi_card_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a card" /></SelectTrigger>
                <SelectContent>
                  {cards.filter(c => c.active).map(c => <SelectItem key={c.id} value={c.id}>{c.kpi_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Venue</Label>
                <Select value={form.venue_id ?? "__all__"} onValueChange={(v) => setForm({ ...form, venue_id: v === "__all__" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Venues</SelectItem>
                    {venues.filter(v => v.is_active).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Period</Label>
                <Select value={form.target_period ?? "day"} onValueChange={(v) => setForm({ ...form, target_period: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Calculation method</Label>
              <Select value={form.calculation_method ?? "manual"} onValueChange={(v) => setForm({ ...form, calculation_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual target</SelectItem>
                  <SelectItem value="venue_specific">Venue-specific</SelectItem>
                  <SelectItem value="day_of_week">Historical day-of-week (set 7 values)</SelectItem>
                  <SelectItem value="mtd">Month-to-date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.calculation_method === "day_of_week" ? (
              <div className="space-y-2">
                <Label>Target value per weekday</Label>
                <div className="grid grid-cols-7 gap-2">
                  {DOWS.map((d, i) => (
                    <div key={d}>
                      <div className="text-[10px] text-center text-muted-foreground">{d}</div>
                      <Input type="number" step="0.01" value={dowValues[i] ?? ""} onChange={(e) => setDowValues({ ...dowValues, [i]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Label>Target value</Label>
                <Input type="number" step="0.01" value={form.target_value ?? ""} onChange={(e) => setForm({ ...form, target_value: parseFloat(e.target.value) })} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Warning threshold %</Label>
                <Input type="number" value={form.warning_threshold_pct ?? 10} onChange={(e) => setForm({ ...form, warning_threshold_pct: parseFloat(e.target.value) })} />
              </div>
              <div>
                <Label>Critical threshold %</Label>
                <Input type="number" value={form.critical_threshold_pct ?? 20} onChange={(e) => setForm({ ...form, critical_threshold_pct: parseFloat(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReset}>Cancel</Button>
            <Button onClick={submit}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
