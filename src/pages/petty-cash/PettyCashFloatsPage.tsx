import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/salesUtils";
import { usePettyCash, type PettyFloat } from "@/hooks/usePettyCash";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { PettyCashHeader, healthColor } from "./_shared";

export default function PettyCashFloatsPage() {
  const pc = usePettyCash();
  const [editing, setEditing] = useState<Partial<PettyFloat> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PettyFloat | null>(null);
  const cashAccounts = pc.coa.filter((a) => a.account_type === "asset");

  const save = async () => {
    if (!editing || !pc.tenantId) return;
    const payload: any = {
      tenant_id: pc.tenantId,
      name: editing.name?.trim(),
      venue: editing.venue?.trim(),
      gl_account_id: editing.gl_account_id || null,
      float_amount: Number(editing.float_amount ?? 0),
      replenish_threshold: Number(editing.replenish_threshold ?? 0),
      is_active: editing.is_active ?? true,
      notes: editing.notes ?? null,
    };
    if (!payload.name || !payload.venue) { toast.error("Name and venue required"); return; }
    const q = editing.id
      ? supabase.from("petty_cash_floats").update(payload).eq("id", editing.id)
      : supabase.from("petty_cash_floats").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditing(null); pc.reload();
  };

  const del = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from("petty_cash_floats").delete().eq("id", confirmDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); setConfirmDelete(null); pc.reload();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PettyCashHeader title="Petty Cash Floats" subtitle="Physical cash floats per venue." />

      {pc.loading ? (
        <Card className="card-glass p-10 text-center text-muted-foreground">Loading…</Card>
      ) : (
        <Card className="card-glass p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Floats</h2>
            <Button size="sm" onClick={() => setEditing({ float_amount: 2000, replenish_threshold: 500, is_active: true })}>
              <Plus className="h-4 w-4 mr-1" />New float
            </Button>
          </div>

          {pc.floats.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No floats yet.</div>
          ) : (
            <div className="text-sm">
              <div className="grid grid-cols-[1fr_1fr_130px_130px_130px_100px_100px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
                <span>Name</span><span>Venue</span><span className="text-right">Target</span><span className="text-right">Threshold</span><span className="text-right">Balance</span><span>Status</span><span className="text-right">Actions</span>
              </div>
              {pc.floats.map((f) => {
                const bal = pc.balanceByFloat[f.id] ?? 0;
                return (
                  <div key={f.id} className="grid grid-cols-[1fr_1fr_130px_130px_130px_100px_100px] gap-3 py-2 border-b border-border/50 items-center">
                    <span className="truncate">{f.name}</span>
                    <span className="truncate text-muted-foreground">{f.venue}</span>
                    <span className="text-right">{formatCurrency(f.float_amount)}</span>
                    <span className="text-right">{formatCurrency(f.replenish_threshold)}</span>
                    <span className={`text-right font-medium ${healthColor(bal, Number(f.replenish_threshold))}`}>{formatCurrency(bal)}</span>
                    <span>{f.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</span>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(f)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(f)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader><SheetTitle>{editing?.id ? "Edit float" : "New float"}</SheetTitle></SheetHeader>
              {editing && (
                <div className="space-y-3 mt-4">
                  <div><Label className="text-xs">Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                  <div><Label className="text-xs">Venue</Label><Input value={editing.venue ?? ""} onChange={(e) => setEditing({ ...editing, venue: e.target.value })} /></div>
                  <div>
                    <Label className="text-xs">Cash GL account</Label>
                    <Select value={editing.gl_account_id ?? ""} onValueChange={(v) => setEditing({ ...editing, gl_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Target float</Label><Input type="number" step="0.01" value={editing.float_amount ?? 0} onChange={(e) => setEditing({ ...editing, float_amount: Number(e.target.value) })} /></div>
                    <div><Label className="text-xs">Replenish ≤</Label><Input type="number" step="0.01" value={editing.replenish_threshold ?? 0} onChange={(e) => setEditing({ ...editing, replenish_threshold: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label className="text-xs">Active</Label></div>
                  <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
                </div>
              )}
              <SheetFooter className="mt-4">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={save}>Save</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <DeleteConfirmDialog
            open={!!confirmDelete}
            onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
            onConfirm={del}
            title="Delete float?"
            description={`This will delete "${confirmDelete?.name}". Receipts referencing it will block deletion.`}
          />
        </Card>
      )}
    </div>
  );
}
