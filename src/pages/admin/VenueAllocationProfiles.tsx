/**
 * /admin/allocation-profiles — Venue cost allocation profiles.
 *
 * Reusable named splits (e.g. "Assembly 40 / Caliente 30 / Hanabi 20 / Arca 10")
 * that can be referenced from employees and expense bills to slice cost across
 * venues for management-accounting reporting. Never affects the GL.
 */
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/components/expenses/shared";
import { useVenueAllocationProfiles, VenueAllocationProfile } from "@/hooks/useVenueAllocationProfiles";
import { useVenues } from "@/hooks/useVenues";

type LineDraft = { venue_id: string; percent: number };

export default function VenueAllocationProfilesPage() {
  const { profiles, linesFor, loading, saveProfile, remove } = useVenueAllocationProfiles();
  const { venues } = useVenues();
  const activeVenues = useMemo(() => venues.filter(v => v.is_active), [venues]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<VenueAllocationProfile> | null>(null);
  const [draftLines, setDraftLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing({ name: "", method: "manual", is_active: true, is_default: false, notes: "" });
    setDraftLines(activeVenues.map(v => ({ venue_id: v.id, percent: 0 })));
    setOpen(true);
  };
  const openEdit = (p: VenueAllocationProfile) => {
    setEditing({ ...p });
    const existing = linesFor(p.id).map(l => ({ venue_id: l.venue_id, percent: Number(l.percent) }));
    const missing = activeVenues.filter(v => !existing.find(l => l.venue_id === v.id))
      .map(v => ({ venue_id: v.id, percent: 0 }));
    setDraftLines([...existing, ...missing]);
    setOpen(true);
  };

  const total = draftLines.reduce((s, l) => s + Number(l.percent || 0), 0);
  const balanced = Math.abs(total - 100) < 0.01;

  const applyEvenSplit = () => {
    const included = draftLines.filter(l => l.percent > 0).length || draftLines.length;
    const pct = 100 / included;
    setDraftLines(draftLines.map((l, i) => ({
      ...l,
      percent: included === draftLines.length || l.percent > 0
        ? Number((i === 0 ? 100 - pct * (included - 1) : pct).toFixed(2))
        : 0,
    })));
  };

  const setLinePct = (venue_id: string, val: string) => {
    setDraftLines(prev => prev.map(l => l.venue_id === venue_id ? { ...l, percent: Number(val) || 0 } : l));
  };

  const handleSave = async () => {
    setSaving(true);
    const id = await saveProfile(
      editing || {},
      draftLines.filter(l => Number(l.percent) > 0),
    );
    setSaving(false);
    if (id) setOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Venue Allocation Profiles"
        description="Reusable splits for slicing shared employee or utility costs across venues. Reporting-only — never affects the ledger."
        icon={PieChart}
        actions={<Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> New profile</Button>}
      />

      <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : profiles.length === 0 ? (
          <EmptyState title="No profiles yet" description="Create your first allocation profile to split shared costs across venues." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">Method</th>
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">Split</th>
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, idx) => {
                const ls = linesFor(p.id);
                return (
                  <tr key={p.id} className={idx !== profiles.length - 1 ? "border-b border-border/50" : ""}>
                    <td className="px-4 py-2.5 font-medium">{p.name}{p.is_default && <span className="ml-2 text-[10px] uppercase text-primary">Default</span>}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.method}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs tabular-nums">
                      {ls.map(l => {
                        const vn = venues.find(v => v.id === l.venue_id)?.name || "?";
                        return `${vn} ${Number(l.percent).toFixed(0)}%`;
                      }).join(" · ") || <span className="italic">no lines</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{p.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button className="p-1 rounded hover:bg-accent/20" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5 text-muted-foreground/70" /></button>
                      <button className="p-1 rounded hover:bg-accent/20 ml-1" onClick={() => { if (confirm(`Delete "${p.name}"?`)) remove(p.id); }}><Trash2 className="h-3.5 w-3.5 text-muted-foreground/70" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit profile" : "New allocation profile"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
                  <Input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Head office split" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Method</label>
                  <Select value={editing.method || "manual"} onValueChange={v => setEditing({ ...editing, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual %</SelectItem>
                      <SelectItem value="even">Even split</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={editing.is_active ?? true} onCheckedChange={v => setEditing({ ...editing, is_active: v })} />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={editing.is_default ?? false} onCheckedChange={v => setEditing({ ...editing, is_default: v })} />
                    Default
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Venue split</div>
                  <button type="button" onClick={applyEvenSplit} className="text-xs text-primary hover:underline">Fill evenly</button>
                </div>
                <div className="space-y-1.5">
                  {draftLines.map(l => {
                    const vn = venues.find(v => v.id === l.venue_id)?.name || "?";
                    return (
                      <div key={l.venue_id} className="flex items-center gap-2">
                        <div className="flex-1 text-sm">{vn}</div>
                        <Input
                          type="number" step="0.01" min="0" max="100"
                          value={l.percent || ""}
                          onChange={e => setLinePct(l.venue_id, e.target.value)}
                          className="w-24 h-8 text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground w-4">%</span>
                      </div>
                    );
                  })}
                </div>
                <div className={`mt-2 text-xs tabular-nums ${balanced ? "text-primary" : "text-destructive"}`}>
                  Total: {total.toFixed(2)}% {balanced ? "✓" : `(must equal 100%)`}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !balanced}>{saving ? "Saving…" : "Save profile"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
