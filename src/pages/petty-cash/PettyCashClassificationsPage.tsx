import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePettyCash, type PettyClassification } from "@/hooks/usePettyCash";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { PettyCashHeader } from "./_shared";

export default function PettyCashClassificationsPage() {
  const pc = usePettyCash();
  const [editing, setEditing] = useState<Partial<PettyClassification> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PettyClassification | null>(null);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      await pc.seedClassifications();
      toast.success("Seed defaults added");
    } catch (e: any) {
      toast.error(e.message || "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const save = async () => {
    if (!editing || !pc.tenantId) return;
    if (!editing.name?.trim() || !editing.financial_type) { toast.error("Name and type required"); return; }
    const payload: any = {
      tenant_id: pc.tenantId,
      name: editing.name.trim(),
      financial_type: editing.financial_type,
      gl_account_id: editing.gl_account_id || null,
      color: editing.color || "#888780",
      sort_order: editing.sort_order ?? 0,
      is_active: editing.is_active ?? true,
    };
    const q = editing.id
      ? supabase.from("petty_cash_classifications").update(payload).eq("id", editing.id)
      : supabase.from("petty_cash_classifications").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditing(null); pc.reload();
  };

  const del = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from("petty_cash_classifications").delete().eq("id", confirmDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); setConfirmDelete(null); pc.reload();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PettyCashHeader title="Petty Cash Classifications" subtitle="Categorise receipts and map to GL accounts." />

      {pc.loading ? (
        <Card className="card-glass p-10 text-center text-muted-foreground">Loading…</Card>
      ) : (
        <Card className="card-glass p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Classifications</h2>
            <div className="flex gap-2">
              {pc.classifications.length === 0 && (
                <Button size="sm" variant="outline" onClick={seed} disabled={seeding}>
                  <Sparkles className="h-4 w-4 mr-1" />{seeding ? "Seeding…" : "Seed defaults"}
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing({ financial_type: "opex", color: "#888780", is_active: true, sort_order: 0 })}>
                <Plus className="h-4 w-4 mr-1" />New
              </Button>
            </div>
          </div>

          {pc.classifications.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No classifications yet — click <span className="font-medium">Seed defaults</span> to add the standard 7.
            </div>
          ) : (
            <div className="text-sm">
              <div className="grid grid-cols-[24px_1fr_100px_1fr_80px_100px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
                <span></span><span>Name</span><span>Type</span><span>GL account</span><span>Status</span><span className="text-right">Actions</span>
              </div>
              {pc.classifications.map((c) => {
                const acc = pc.coa.find((a) => a.id === c.gl_account_id);
                return (
                  <div key={c.id} className="grid grid-cols-[24px_1fr_100px_1fr_80px_100px] gap-3 py-2 border-b border-border/50 items-center">
                    <span className="h-4 w-4 rounded-full" style={{ background: c.color }} />
                    <span>{c.name}</span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.financial_type}</span>
                    <span className="text-xs">{acc ? `${acc.code} — ${acc.name}` : <span className="text-red-500">Not set</span>}</span>
                    <span>{c.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</span>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(c)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader><SheetTitle>{editing?.id ? "Edit classification" : "New classification"}</SheetTitle></SheetHeader>
              {editing && (
                <div className="space-y-3 mt-4">
                  <div><Label className="text-xs">Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                  <div>
                    <Label className="text-xs">Financial type</Label>
                    <Select value={editing.financial_type} onValueChange={(v: any) => setEditing({ ...editing, financial_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cogs">COGS</SelectItem>
                        <SelectItem value="opex">OpEx</SelectItem>
                        <SelectItem value="asset">Asset</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">GL account</Label>
                    <Select value={editing.gl_account_id ?? ""} onValueChange={(v) => setEditing({ ...editing, gl_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{pc.coa.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Color</Label><Input type="color" value={editing.color ?? "#888780"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></div>
                    <div><Label className="text-xs">Sort order</Label><Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label className="text-xs">Active</Label></div>
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
            title="Delete classification?"
            description={`This will delete "${confirmDelete?.name}".`}
          />
        </Card>
      )}
    </div>
  );
}
