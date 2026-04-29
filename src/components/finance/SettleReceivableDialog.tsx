import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { AROpenItem } from "@/hooks/useReceivables";

export function SettleReceivableDialog({
  item,
  open,
  onOpenChange,
  onSettled,
}: {
  item: AROpenItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSettled: () => void;
}) {
  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [cashAccountId, setCashAccountId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name")
        .eq("is_cash", true)
        .eq("is_active", true)
        .order("code");
      const accs = data || [];
      setCashAccounts(accs);
      if (accs.length > 0 && !cashAccountId) setCashAccountId(accs[0].id);
    })();
    if (item) setAmount(item.open_amount.toFixed(2));
  }, [open, item]);

  const handleSettle = async () => {
    if (!item || !cashAccountId) return;
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Amount must be > 0"); return; }
    if (amt > item.open_amount + 0.01) { toast.error(`Cannot settle more than open amount (${item.open_amount})`); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: date,
        memo: `Settlement — ${item.account_name}${item.memo ? ' / ' + item.memo : ''}`,
        source_type: "manual",
        venue: item.venue,
        status: "draft",
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (eErr || !entry) { setBusy(false); toast.error(eErr?.message || "Failed"); return; }

    const { error: lErr } = await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_id: cashAccountId, debit: amt, credit: 0, venue: item.venue, line_no: 1, memo: `Settle ${item.account_name}` },
      { entry_id: entry.id, account_id: item.account_id, debit: 0, credit: amt, venue: item.venue, line_no: 2, memo: "AR settlement" },
    ]);
    if (lErr) { setBusy(false); toast.error(lErr.message); return; }
    await supabase.from("journal_entries").update({ status: "posted" }).eq("id", entry.id);
    toast.success("Receivable settled");
    setBusy(false);
    onOpenChange(false);
    onSettled();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark Receivable Settled</DialogTitle></DialogHeader>
        {item && (
          <div className="space-y-3 text-sm">
            <div className="bg-muted/40 rounded p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-mono">{item.account_code} · {item.account_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Original date</span><span>{item.entry_date} · {item.age_days}d old</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Open amount</span><span className="font-mono font-semibold">{item.open_amount.toFixed(2)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Settlement date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Deposit to (cash account)</Label>
              <Select value={cashAccountId} onValueChange={setCashAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSettle} disabled={busy || !cashAccountId}>{busy ? "Settling…" : "Settle"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
