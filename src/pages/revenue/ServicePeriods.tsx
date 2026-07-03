import { useEffect, useMemo, useState } from "react";
import { Clock, Pencil, Plus, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useVenues } from "@/hooks/useVenues";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { useRevenueTargetMutations } from "@/hooks/useRevenueTargetMutations";
import { useRevenueTargetPermissions } from "@/hooks/useRevenueTargetPermissions";
import type { VenueServicePeriod } from "@/types/revenueTargetsV2";

// Sunday-first ordering, matches Postgres EXTRACT(DOW ...) — 0=Sun … 6=Sat.
const WEEKDAYS = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

type FormState = {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  applicableWeekdays: number[];
  effectiveFrom: string;
  effectiveTo: string;
  sortOrder: number;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  startTime: "12:00",
  endTime: "15:00",
  crossesMidnight: false,
  applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
  effectiveFrom: todayISO(),
  effectiveTo: "",
  sortOrder: 0,
  isActive: true,
};

function formatWeekdays(days: number[]) {
  if (!days.length) return "—";
  if (days.length === 7) return "Every day";
  return WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => w.label).join(", ");
}

export default function ServicePeriods() {
  const { venues, loading: venuesLoading } = useVenues();
  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");

  useEffect(() => {
    if (!selectedVenueId && activeVenues.length) setSelectedVenueId(activeVenues[0].id);
  }, [activeVenues, selectedVenueId]);

  const { rows, loading, refetch } = useVenueServicePeriods(
    selectedVenueId ? [selectedVenueId] : undefined,
  );
  const { upsertServicePeriod, deactivateServicePeriod } = useRevenueTargetMutations();
  const { canEditManagerTargets } = useRevenueTargetPermissions();

  const scoped = useMemo(
    () => rows.filter((r) => r.venueId === selectedVenueId),
    [rows, selectedVenueId],
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<VenueServicePeriod | null>(null);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const startEdit = (p: VenueServicePeriod) => {
    setForm({
      id: p.id,
      name: p.name,
      startTime: p.startTime?.slice(0, 5) ?? "12:00",
      endTime: p.endTime?.slice(0, 5) ?? "15:00",
      crossesMidnight: p.crossesMidnight,
      applicableWeekdays: p.applicableWeekdays,
      effectiveFrom: p.effectiveFrom ?? todayISO(),
      effectiveTo: p.effectiveTo ?? "",
      sortOrder: p.sortOrder,
      isActive: p.isActive,
    });
    setShowForm(true);
  };

  const toggleWeekday = (n: number) => {
    setForm((f) => ({
      ...f,
      applicableWeekdays: f.applicableWeekdays.includes(n)
        ? f.applicableWeekdays.filter((d) => d !== n)
        : [...f.applicableWeekdays, n].sort((a, b) => a - b),
    }));
  };

  const submit = async () => {
    if (!selectedVenueId) return;
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!form.applicableWeekdays.length) {
      toast({ title: "Select at least one weekday", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await upsertServicePeriod({
      id: form.id,
      venueId: selectedVenueId,
      name: form.name.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      crossesMidnight: form.crossesMidnight,
      applicableWeekdays: form.applicableWeekdays,
      isActive: form.isActive,
      sortOrder: form.sortOrder,
      effectiveFrom: form.effectiveFrom || todayISO(),
      effectiveTo: form.effectiveTo || null,
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: form.id ? "Service period updated" : "Service period created" });
      resetForm();
      refetch();
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) return;
    const res = await deactivateServicePeriod(deactivating.id);
    if (res.ok) {
      toast({ title: "Service period deactivated" });
      refetch();
    }
    setDeactivating(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Service Periods
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Configure lunch, dinner, happy hour and other operating windows per venue. These periods
            drive daily target breakdowns and do not modify historical data.
          </p>
        </div>
        {canEditManagerTargets && selectedVenueId && !showForm && (
          <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Period
          </Button>
        )}
      </div>

      <div className="card-glass rounded-lg p-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Venue</Label>
        <div className="mt-2 max-w-sm">
          <Select value={selectedVenueId} onValueChange={setSelectedVenueId} disabled={venuesLoading}>
            <SelectTrigger>
              <SelectValue placeholder={venuesLoading ? "Loading venues…" : "Select a venue"} />
            </SelectTrigger>
            <SelectContent>
              {activeVenues.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showForm && canEditManagerTargets && (
        <div className="card-glass rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {form.id ? "Edit service period" : "New service period"}
            </div>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Lunch"
              />
            </div>
            <div>
              <Label className="text-xs">Sort order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label className="text-xs">Start time</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">End time</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Effective from</Label>
              <Input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Effective to (optional)</Label>
              <Input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Applicable weekdays</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => {
                const on = form.applicableWeekdays.includes(w.n);
                return (
                  <button
                    key={w.n}
                    type="button"
                    onClick={() => toggleWeekday(w.n)}
                    className={`px-3 py-1 rounded-full text-xs border transition ${
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.crossesMidnight}
                onCheckedChange={(v) => setForm({ ...form, crossesMidnight: !!v })}
              />
              Crosses midnight (end time is on the next day)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: !!v })}
              />
              Active
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={resetForm} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : form.id ? "Save changes" : "Create period"}
            </Button>
          </div>
        </div>
      )}

      <div className="card-glass rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60">
          <div className="text-sm font-semibold">Periods</div>
          <div className="text-xs text-muted-foreground">
            {scoped.length} period{scoped.length === 1 ? "" : "s"} configured for this venue.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Weekdays</th>
                <th className="text-left px-4 py-2 font-medium">Effective</th>
                <th className="text-left px-4 py-2 font-medium">Sort</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                {canEditManagerTargets && (
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canEditManagerTargets ? 7 : 6} className="px-4 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && !selectedVenueId && (
                <tr>
                  <td colSpan={canEditManagerTargets ? 7 : 6} className="px-4 py-6 text-center text-muted-foreground">
                    Select a venue to view its service periods.
                  </td>
                </tr>
              )}
              {!loading && selectedVenueId && scoped.length === 0 && (
                <tr>
                  <td colSpan={canEditManagerTargets ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">
                    No service periods yet.{canEditManagerTargets ? " Click Add Period to create one." : ""}
                  </td>
                </tr>
              )}
              {scoped.map((p, idx) => (
                <tr
                  key={p.id}
                  className={`border-t border-border/40 ${idx % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className="px-4 py-2 font-medium">
                    <div>{p.name}</div>
                    {p.isRollupOnly && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Auto-managed rollup — do not edit
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 td-num">
                    {p.startTime?.slice(0, 5)} – {p.endTime?.slice(0, 5)}
                    {p.crossesMidnight && <span className="text-muted-foreground ml-1">+1d</span>}
                  </td>
                  <td className="px-4 py-2 text-xs">{formatWeekdays(p.applicableWeekdays)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {p.effectiveFrom ?? "—"}
                    {p.effectiveTo ? ` → ${p.effectiveTo}` : ""}
                  </td>
                  <td className="px-4 py-2 td-num">{p.sortOrder}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant="outline"
                        className={
                          p.isActive
                            ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                            : "border-border text-muted-foreground"
                        }
                      >
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {p.isRollupOnly && (
                        <Badge variant="outline" className="border-sky-500/40 text-sky-500 bg-sky-500/10">
                          Rollup-only
                        </Badge>
                      )}
                    </div>
                  </td>
                  {canEditManagerTargets && (
                    <td className="px-4 py-2 text-right">
                      {p.isRollupOnly ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {p.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeactivating(p)}
                              title="Deactivate"
                            >
                              <PowerOff className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!deactivating} onOpenChange={(o) => !o && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate service period?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deactivating?.name}" will stop applying to new target days from today. Historical target
              lines that reference this period are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
