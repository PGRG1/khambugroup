import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/salesUtils";
import { usePettyCash, type PettyReplenishment } from "@/hooks/usePettyCash";
import { PettyCashHeader, fmtDate } from "./_shared";

export default function PettyCashReplenishmentsPage() {
  const pc = usePettyCash();
  const [floatId, setFloatId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [bankId, setBankId] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (!floatId && pc.floats[0]?.id) setFloatId(pc.floats[0].id);

  const canSubmit = floatId && amount && Number(amount) > 0 && bankId;

  const submit = async () => {
    if (!canSubmit || !pc.tenantId) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase.from("petty_cash_replenishments").insert({
        tenant_id: pc.tenantId,
        float_id: floatId,
        replenishment_date: date,
        amount: Number(amount),
        from_bank_account_id: bankId,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        created_by: userData.user?.id ?? null,
      } as any).select("*").single();
      if (error) throw error;

      await pc.postReplenishment(inserted as PettyReplenishment);
      toast.success("Replenishment recorded and posted");
      setAmount(""); setReference(""); setNotes("");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PettyCashHeader title="Petty Cash Replenishments" subtitle="Top up float balances from bank." />

      {pc.loading ? (
        <Card className="card-glass p-10 text-center text-muted-foreground">Loading…</Card>
      ) : (
        <>
          <Card className="card-glass p-4">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Replenish a float</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs">Float</Label>
                <Select value={floatId} onValueChange={setFloatId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{pc.floats.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">From bank</Label>
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{pc.bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Reference</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Cheque #123" />
              </div>
              <div className="flex items-end">
                <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
                  <Plus className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Replenish"}
                </Button>
              </div>
              <div className="md:col-span-6">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card className="card-glass p-4">
            <h2 className="text-sm font-semibold mb-3">Replenishment history</h2>
            {pc.replenishments.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No replenishments yet.</div>
            ) : (
              <div className="text-sm">
                <div className="grid grid-cols-[90px_1fr_1fr_120px_140px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
                  <span>Date</span><span>Float</span><span>Bank</span><span>Reference</span><span className="text-right">Amount</span>
                </div>
                {pc.replenishments.map((r) => {
                  const flt = pc.floats.find((f) => f.id === r.float_id);
                  const bank = pc.bankAccounts.find((b) => b.id === r.from_bank_account_id);
                  return (
                    <div key={r.id} className="grid grid-cols-[90px_1fr_1fr_120px_140px] gap-3 py-2 border-b border-border/50 items-center">
                      <span className="text-xs">{fmtDate(r.replenishment_date)}</span>
                      <span>{flt?.name ?? "—"}</span>
                      <span>{bank?.account_name ?? "—"}</span>
                      <span className="text-xs">{r.reference ?? "—"}</span>
                      <span className="text-right">{formatCurrency(r.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
