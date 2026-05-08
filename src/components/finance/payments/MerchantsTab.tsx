import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentProcessor, ProcessorMerchant } from "@/hooks/usePaymentSettlements";
import type { BankAccount } from "@/hooks/useBankReconciliation";
import { useVenues } from "@/hooks/useVenues";

type Props = {
  processor: PaymentProcessor | null;
  merchants: ProcessorMerchant[];
  bankAccounts: BankAccount[];
  onChanged: () => void;
};

const NONE = "__none__";

export function MerchantsTab({ processor, merchants, bankAccounts, onChanged }: Props) {
  const { venues } = useVenues();
  const [editing, setEditing] = useState<ProcessorMerchant | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(
    () => (processor ? merchants.filter((m) => m.processor_id === processor.id) : []),
    [merchants, processor],
  );

  const venueOptions = venues.map((v) => v.name);

  const handleSave = async (m: Partial<ProcessorMerchant>) => {
    if (!processor) return;
    if (!m.merchant_number || !m.display_name) {
      toast({ title: "Merchant # and name are required", variant: "destructive" });
      return;
    }
    const payload: any = {
      processor_id: processor.id,
      merchant_number: m.merchant_number,
      display_name: m.display_name,
      venue: m.venue || null,
      shared_venues: m.shared_venues || [],
      default_bank_account_id: m.default_bank_account_id || null,
      store_address: m.store_address || "",
      is_active: m.is_active ?? true,
      sort_order: m.sort_order ?? filtered.length,
      notes: m.notes || "",
    };
    if (editing?.id) {
      const { error } = await supabase.from("payment_processor_merchants" as any).update(payload).eq("id", editing.id);
      if (error) return toast({ title: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("payment_processor_merchants" as any).insert(payload);
      if (error) return toast({ title: error.message, variant: "destructive" });
    }
    toast({ title: "Saved" });
    setEditing(null);
    setCreating(false);
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this merchant? Settlement batches linked to it will fail to insert.")) return;
    const { error } = await supabase.from("payment_processor_merchants" as any).delete().eq("id", id);
    if (error) return toast({ title: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Merchant accounts</h3>
          <p className="text-xs text-muted-foreground">
            One row per merchant number. Map each to a venue (or list shared venues) and the bank account that
            receives the net settlement.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} disabled={!processor}>
          <Plus className="h-4 w-4 mr-1" /> Add merchant
        </Button>
      </div>

      <Card className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Merchant #</th>
                <th className="text-left px-3 py-2">Display name</th>
                <th className="text-left px-3 py-2">Venue / Shared</th>
                <th className="text-left px-3 py-2">Default bank</th>
                <th className="text-left px-3 py-2">Active</th>
                <th className="text-right px-3 py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No merchants yet</td></tr>
              )}
              {filtered.map((m) => {
                const bank = bankAccounts.find((b) => b.id === m.default_bank_account_id);
                const venueLabel = m.shared_venues.length > 0 ? m.shared_venues.join(" + ") : (m.venue || "—");
                return (
                  <tr key={m.id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono">{m.merchant_number}</td>
                    <td className="px-3 py-2">{m.display_name}</td>
                    <td className="px-3 py-2">{venueLabel}</td>
                    <td className="px-3 py-2 text-xs">
                      {bank ? `${bank.bank_name} •••${bank.account_number_last4}` : <span className="text-muted-foreground">Not set</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`chip ${m.is_active ? "chip-success" : "chip-neutral"}`}>{m.is_active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <MerchantDialog
        open={creating || !!editing}
        merchant={editing}
        venueOptions={venueOptions}
        bankAccounts={bankAccounts}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={handleSave}
      />
    </div>
  );
}

function MerchantDialog({
  open, merchant, venueOptions, bankAccounts, onClose, onSave,
}: {
  open: boolean;
  merchant: ProcessorMerchant | null;
  venueOptions: string[];
  bankAccounts: BankAccount[];
  onClose: () => void;
  onSave: (m: Partial<ProcessorMerchant>) => void;
}) {
  const [form, setForm] = useState<Partial<ProcessorMerchant>>(merchant || { is_active: true, shared_venues: [] });

  // sync when target changes
  useEffect(() => { setForm(merchant || { is_active: true, shared_venues: [] }); }, [merchant, open]);

  const isShared = (form.shared_venues?.length || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{merchant ? "Edit merchant" : "Add merchant"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Merchant #</Label>
              <Input value={form.merchant_number || ""} onChange={(e) => setForm({ ...form, merchant_number: e.target.value })} />
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Venue</Label>
            <Select
              value={form.venue || NONE}
              onValueChange={(v) => setForm({ ...form, venue: v === NONE ? null : v, shared_venues: v === NONE ? form.shared_venues : [] })}
              disabled={isShared}
            >
              <SelectTrigger><SelectValue placeholder="Single venue…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {venueOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Shared across venues (for merged merchants)</Label>
            <div className="flex flex-wrap gap-3 mt-1 p-2 rounded-md border border-border/40 bg-card/40">
              {venueOptions.map((v) => {
                const checked = (form.shared_venues || []).includes(v);
                return (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const cur = new Set(form.shared_venues || []);
                        if (c) cur.add(v); else cur.delete(v);
                        setForm({ ...form, shared_venues: Array.from(cur), venue: cur.size > 0 ? null : form.venue });
                      }}
                    /> {v}
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Use this when a single merchant number combines two venues (e.g. Caliente + Hanabi).</p>
          </div>

          <div>
            <Label>Default bank account</Label>
            <Select
              value={form.default_bank_account_id || NONE}
              onValueChange={(v) => setForm({ ...form, default_bank_account_id: v === NONE ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Not set —</SelectItem>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bank_name} • {b.account_name} •••{b.account_number_last4}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Store address (optional)</Label>
            <Input value={form.store_address || ""} onChange={(e) => setForm({ ...form, store_address: e.target.value })} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox checked={form.is_active ?? true} onCheckedChange={(c) => setForm({ ...form, is_active: !!c })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
