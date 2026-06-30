import { useMemo, useState } from "react";
import { useBankModule } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeftRight, Plus } from "lucide-react";
import { toast } from "sonner";

export default function TransfersPage() {
  const { accounts, transfers, createTransfer } = useBankModule();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ fromId: string; toId: string; amount: number; date: string; fxRate?: number; note?: string }>(
    { fromId: "", toId: "", amount: 0, date: new Date().toISOString().slice(0, 10) },
  );

  const pairs = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of transfers) {
      if (!t.transfer_pair_id) continue;
      const arr = map.get(t.transfer_pair_id) || [];
      arr.push(t);
      map.set(t.transfer_pair_id, arr);
    }
    return Array.from(map.entries());
  }, [transfers]);

  const acctName = (id: string) => accounts.find((a) => a.id === id)?.account_name || "—";
  const acctCcy = (id: string) => accounts.find((a) => a.id === id)?.currency || "HKD";

  const isCrossCcy = form.fromId && form.toId && acctCcy(form.fromId) !== acctCcy(form.toId);

  const submit = async () => {
    if (!form.fromId || !form.toId || form.fromId === form.toId) { toast.error("Pick two different accounts"); return; }
    if (!form.amount || form.amount <= 0) { toast.error("Amount required"); return; }
    if (isCrossCcy && !form.fxRate) { toast.error("FX rate required for cross-currency"); return; }
    try { await createTransfer(form.fromId, form.toId, form.amount, form.date, form.fxRate, form.note); toast.success("Transfer recorded"); setOpen(false); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <BankPageShell
      title="Transfers"
      description="Move money between company bank accounts, including cross-currency."
      actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New transfer</Button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Transfer legs" value={transfers.length} />
        <BankKpi label="Transfer pairs" value={pairs.length} />
        <BankKpi label="Bank accounts" value={accounts.length} />
        <BankKpi label="Currencies" value={new Set(accounts.map((a) => a.currency)).size} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
            <TableHead className="text-right">Out</TableHead><TableHead className="text-right">In</TableHead>
            <TableHead>FX rate</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {pairs.map(([id, legs]) => {
              const out = legs.find((l) => Number(l.money_out) > 0);
              const inc = legs.find((l) => Number(l.money_in) > 0);
              return (
                <TableRow key={id}>
                  <TableCell>{fmtDate(out?.txn_date || inc?.txn_date)}</TableCell>
                  <TableCell>{out ? acctName(out.bank_account_id) : "—"}</TableCell>
                  <TableCell><ArrowLeftRight className="inline h-3 w-3 mr-1 text-muted-foreground" />{inc ? acctName(inc.bank_account_id) : "—"}</TableCell>
                  <TableCell className="text-right font-mono td-num text-rose-600">{out ? fmtMoney(out.money_out, acctCcy(out.bank_account_id)) : "—"}</TableCell>
                  <TableCell className="text-right font-mono td-num text-emerald-600">{inc ? fmtMoney(inc.money_in, acctCcy(inc.bank_account_id)) : "—"}</TableCell>
                  <TableCell>{out?.fx_rate ?? inc?.fx_rate ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{out?.status || inc?.status}</Badge></TableCell>
                </TableRow>
              );
            })}
            {!pairs.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No transfers yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>New transfer</SheetTitle></SheetHeader>
          <div className="py-4 space-y-3">
            <Field label="From account">
              <Select value={form.fromId} onValueChange={(v) => setForm({ ...form, fromId: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name} ({a.currency})</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="To account">
              <Select value={form.toId} onValueChange={(v) => setForm({ ...form, toId: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name} ({a.currency})</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Amount (from)">
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
            </div>
            {isCrossCcy && (
              <Field label={`FX rate (${acctCcy(form.fromId)} → ${acctCcy(form.toId)})`}>
                <Input type="number" step="0.000001" value={form.fxRate ?? ""} onChange={(e) => setForm({ ...form, fxRate: Number(e.target.value) })} />
              </Field>
            )}
            <Field label="Note (optional)">
              <Input value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Create transfer</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </BankPageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
