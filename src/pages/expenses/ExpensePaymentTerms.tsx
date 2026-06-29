import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";

interface PaymentTerm {
  id: string;
  name: string;
  days: number;
  description: string | null;
  is_active: boolean;
}

export default function ExpensePaymentTermsPage() {
  const { tenantId } = useActiveTenant();
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<PaymentTerm>>({});

  const load = async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from("expense_payment_terms")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) { toast.error(error.message); return; }
    setRows((data || []) as any);
  };

  useEffect(() => { load(); }, [tenantId]);

  const save = async () => {
    if (!editing.name) { toast.error("Name is required"); return; }
    if (editing.days == null || editing.days < 0) { toast.error("Days must be 0 or more"); return; }
    const payload: any = {
      name: editing.name,
      days: editing.days,
      description: editing.description || null,
      is_active: editing.is_active ?? true,
    };
    if (editing.id) {
      const { error } = await supabase.from("expense_payment_terms").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase
        .from("expense_payment_terms")
        .insert({ ...payload, tenant_id: tenantId } as any);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const toggleActive = async (r: PaymentTerm) => {
    const { error } = await supabase
      .from("expense_payment_terms")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (r: PaymentTerm) => {
    const { count, error: cErr } = await supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("payment_terms_id", r.id);
    if (cErr) { toast.error(cErr.message); return; }
    if ((count ?? 0) > 0) {
      toast.error(`This payment term is used by ${count} vendor${count === 1 ? "" : "s"} and cannot be deleted.`);
      return;
    }
    if (!confirm(`Delete "${r.name}"?`)) return;
    const { error } = await supabase.from("expense_payment_terms").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Payment Terms</h1>
          <p className="text-sm text-muted-foreground">Standard terms assigned to vendors and applied to bills.</p>
        </div>
        <Button onClick={() => { setEditing({ days: 30, is_active: true }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Payment Term
        </Button>
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground text-right">Days</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r.id} className={`${idx % 2 === 0 ? "bg-muted/30" : ""} hover:bg-muted/20`}>
                <TableCell className="py-2 px-3 font-medium">{r.name}</TableCell>
                <TableCell className="py-2 px-3 text-right tabular-nums">{r.days} days</TableCell>
                <TableCell className="py-2 px-3 text-muted-foreground">{r.description || "—"}</TableCell>
                <TableCell className="py-2 px-3" onClick={() => toggleActive(r)}>
                  {r.is_active ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="cursor-pointer">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="py-2 px-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No payment terms defined yet. Add your first payment term to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editing.id ? "Edit" : "New"} Payment Term</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Net 30"
                value={editing.name || ""}
                onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Days *</Label>
              <Input
                type="number"
                min={0}
                value={editing.days ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p, days: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editing.description || ""}
                onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <Label className="text-sm">Active</Label>
              <Switch
                checked={editing.is_active ?? true}
                onCheckedChange={(v) => setEditing((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
