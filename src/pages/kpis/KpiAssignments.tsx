import { useState } from "react";
import { useKpiCards, useKpiAssignments, useKpiTargets } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Power } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Profile { user_id: string; display_name: string | null; email?: string | null }

export default function KpiAssignments() {
  const { cards } = useKpiCards();
  const { assignments, create, update, remove } = useKpiAssignments();
  const { venues } = useVenues();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ kpi_card_id: string; mode: "user" | "role" | "all"; assigned_user_id: string; assigned_role: string; venue_ids: string[] }>({
    kpi_card_id: "", mode: "user", assigned_user_id: "", assigned_role: "manager", venue_ids: [],
  });

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  const profileName = (uid: string | null) => {
    if (!uid) return "Any user (role / venue-wide)";
    const p = profiles.find((x) => x.user_id === uid);
    return p?.display_name ?? p?.email ?? uid.slice(0, 8);
  };
  const venueName = (id: string | null) => id ? (venues.find(v => v.id === id)?.name ?? "—") : "All Venues";
  const cardName = (id: string) => cards.find(c => c.id === id)?.kpi_name ?? "—";

  const handleCreate = async () => {
    if (!form.kpi_card_id) return toast({ title: "Pick a KPI card", variant: "destructive" });
    const venueList = form.venue_ids.length ? form.venue_ids : [""];
    let ok = true;
    for (const v of venueList) {
      const payload = {
        kpi_card_id: form.kpi_card_id,
        assigned_user_id: form.mode === "user" ? form.assigned_user_id : null,
        assigned_role: form.mode === "role" ? form.assigned_role : null,
        venue_id: v || null,
      };
      const r = await create(payload);
      if (!r) ok = false;
    }
    if (ok) { setOpen(false); setForm({ kpi_card_id: "", mode: "user", assigned_user_id: "", assigned_role: "manager", venue_ids: [] }); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">KPI Assignment</h1>
          <p className="text-sm text-muted-foreground mt-1">Assign KPI cards to people, roles, or venues.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Assignment</Button>
      </header>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>KPI Card</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No assignments yet.</TableCell></TableRow>
            )}
            {assignments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{cardName(a.kpi_card_id)}</TableCell>
                <TableCell>{profileName(a.assigned_user_id)}</TableCell>
                <TableCell>{a.assigned_role ? <Badge variant="outline">{a.assigned_role}</Badge> : "—"}</TableCell>
                <TableCell>{venueName(a.venue_id)}</TableCell>
                <TableCell>
                  <Switch checked={a.active} onCheckedChange={(v) => update(a.id, { active: v })} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
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
          <DialogHeader><DialogTitle>New KPI Assignment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>KPI Card</Label>
              <Select value={form.kpi_card_id} onValueChange={(v) => setForm({ ...form, kpi_card_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a card" /></SelectTrigger>
                <SelectContent>
                  {cards.filter(c => c.active).map(c => <SelectItem key={c.id} value={c.id}>{c.kpi_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to</Label>
              <Select value={form.mode} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Specific user</SelectItem>
                  <SelectItem value="role">Role</SelectItem>
                  <SelectItem value="all">All users / venue-wide</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.mode === "user" && (
              <div>
                <Label>User</Label>
                <Select value={form.assigned_user_id} onValueChange={(v) => setForm({ ...form, assigned_user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {profiles.filter(p => p.user_id).map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.display_name ?? p.email ?? p.user_id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.mode === "role" && (
              <div>
                <Label>Role</Label>
                <Select value={form.assigned_role} onValueChange={(v) => setForm({ ...form, assigned_role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="gm">GM</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Venues (leave empty for all)</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {venues.filter(v => v.is_active).map(v => {
                  const sel = form.venue_ids.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setForm({ ...form, venue_ids: sel ? form.venue_ids.filter(x => x !== v.id) : [...form.venue_ids, v.id] })}
                      className={`px-3 py-1 rounded-full text-xs border transition ${sel ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "border-zinc-700 text-muted-foreground"}`}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
