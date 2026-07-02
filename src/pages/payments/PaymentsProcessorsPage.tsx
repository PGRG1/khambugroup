import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { usePaymentSettlements, type PaymentProcessor } from "@/hooks/usePaymentSettlements";
import { PageHeader } from "./_shared";

type ProcessorForm = {
  id?: string;
  name: string;
  type: string;
  notes: string;
  is_active: boolean;
};

export default function PaymentsProcessorsPage() {
  const { tenantId, processors, merchants, feeRates, reload } = usePaymentSettlements();

  const merchantCountByProcessor = useMemo(() => {
    const m = new Map<string, number>();
    merchants.forEach((mm) => m.set(mm.processor_id, (m.get(mm.processor_id) || 0) + 1));
    return m;
  }, [merchants]);
  const feeRateCountByProcessor = useMemo(() => {
    const m = new Map<string, number>();
    feeRates.forEach((r) => m.set(r.processor_id, (m.get(r.processor_id) || 0) + 1));
    return m;
  }, [feeRates]);

  const [editing, setEditing] = useState<ProcessorForm | null>(null);
  const [delTarget, setDelTarget] = useState<PaymentProcessor | null>(null);

  const openNew = () => setEditing({ name: "", type: "card", notes: "", is_active: true });
  const openEdit = (p: PaymentProcessor) =>
    setEditing({ id: p.id, name: p.name, type: p.type, notes: p.notes || "", is_active: p.is_active });

  const toggleActive = async (p: PaymentProcessor) => {
    const { error } = await supabase.from("payment_processors" as any).update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    reload();
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Name is required");
    if (!tenantId) return toast.error("No active tenant");
    const payload: any = {
      name: editing.name.trim(),
      type: editing.type,
      notes: editing.notes || "",
      is_active: editing.is_active,
    };
    if (editing.id) {
      const { error } = await supabase.from("payment_processors" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Processor updated");
    } else {
      const { error } = await supabase.from("payment_processors" as any).insert({
        ...payload,
        tenant_id: tenantId,
        sort_order: processors.length,
      });
      if (error) return toast.error(error.message);
      toast.success("Processor added");
    }
    setEditing(null);
    reload();
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    const mc = merchantCountByProcessor.get(delTarget.id) || 0;
    if (mc > 0) {
      toast.error(`This processor has ${mc} merchant${mc === 1 ? "" : "s"}. Remove them first.`);
      setDelTarget(null);
      return;
    }
    const { error } = await supabase.from("payment_processors" as any).delete().eq("id", delTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Processor deleted");
    setDelTarget(null);
    reload();
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payment Processors"
        subtitle="Configure the payment processors you receive settlements from."
        right={<Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add processor</Button>}
      />

      <Card className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Merchants</th>
                <th className="text-right px-3 py-2">Fee rules</th>
                <th className="text-left px-3 py-2">Active</th>
                <th className="text-right px-3 py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {processors.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No processors yet. Add one to get started.</td></tr>
              )}
              {processors.map((p, idx) => (
                <tr key={p.id} className={`border-t border-border/40 hover:bg-muted/40 ${idx % 2 === 0 ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2"><span className="chip chip-info">{p.type}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">{merchantCountByProcessor.get(p.id) || 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">{feeRateCountByProcessor.get(p.id) || 0}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleActive(p)} className={`chip ${p.is_active ? "chip-success" : "chip-neutral"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit processor" : "Add processor"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div>
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="KPay, YeahPay, Stripe…" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="mobile_payment">Mobile payment</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={3} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        onConfirm={confirmDelete}
        title="Delete this processor?"
        description="This action cannot be undone."
      />
    </div>
  );
}
