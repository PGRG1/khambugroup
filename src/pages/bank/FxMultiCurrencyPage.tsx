import { useMemo, useState } from "react";
import { useBankModule, type FxRate } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const CCYS = ["HKD", "USD", "CNY", "EUR", "GBP", "SGD", "JPY"];

export default function FxMultiCurrencyPage() {
  const { accounts, transfers, fxRates, byCurrency, saveFxRate } = useBankModule();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<FxRate>>({ rate_date: new Date().toISOString().slice(0, 10), from_currency: "USD", to_currency: "HKD" });

  const fxGainLoss = useMemo(() => {
    return transfers.reduce((s, t) => s + Number(t.fx_gain_loss || 0), 0);
  }, [transfers]);

  const conversionHistory = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of transfers) {
      if (!t.fx_rate || !t.transfer_pair_id) continue;
      const cur = map.get(t.transfer_pair_id) || {};
      if (Number(t.money_out) > 0) cur.from = t;
      if (Number(t.money_in) > 0) cur.to = t;
      cur.id = t.transfer_pair_id;
      map.set(t.transfer_pair_id, cur);
    }
    return Array.from(map.values());
  }, [transfers]);

  const acctCcy = (id: string) => accounts.find((a) => a.id === id)?.currency || "HKD";

  const save = async () => {
    if (!edit.from_currency || !edit.to_currency || !edit.rate) { toast.error("Rate required"); return; }
    try { await saveFxRate(edit); toast.success("Saved"); setOpen(false); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <BankPageShell
      title="FX &amp; Multi-Currency"
      description="Multi-currency balances, exchange rates and realised FX gains/losses."
      actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add rate</Button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Currencies" value={Object.keys(byCurrency).length} />
        <BankKpi label="FX rates on file" value={fxRates.length} />
        <BankKpi label="FX conversions" value={conversionHistory.length} />
        <BankKpi label="Realised FX gain/loss" value={fmtMoney(fxGainLoss)} tone={fxGainLoss >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-semibold mb-3">Balances by currency</div>
          <Table>
            <TableHeader><TableRow><TableHead>Currency</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {Object.entries(byCurrency).map(([c, b]) => (
                <TableRow key={c}><TableCell className="font-medium">{c}</TableCell><TableCell className="text-right font-mono td-num">{fmtMoney(b, c)}</TableCell></TableRow>
              ))}
              {!Object.keys(byCurrency).length && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No accounts</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3">Exchange rates</div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Pair</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Source</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {fxRates.slice(0, 30).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.rate_date)}</TableCell>
                  <TableCell>{r.from_currency} → {r.to_currency}</TableCell>
                  <TableCell className="text-right font-mono td-num">{Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.source || "manual"}</TableCell>
                </TableRow>
              ))}
              {!fxRates.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No rates</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3">Currency conversion history</div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
            <TableHead className="text-right">From amount</TableHead><TableHead className="text-right">To amount</TableHead>
            <TableHead className="text-right">Rate</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {conversionHistory.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>{fmtDate(c.from?.txn_date || c.to?.txn_date)}</TableCell>
                <TableCell>{c.from ? `${acctCcy(c.from.bank_account_id)}` : "—"}</TableCell>
                <TableCell>{c.to ? `${acctCcy(c.to.bank_account_id)}` : "—"}</TableCell>
                <TableCell className="text-right font-mono td-num">{c.from ? fmtMoney(c.from.money_out, acctCcy(c.from.bank_account_id)) : "—"}</TableCell>
                <TableCell className="text-right font-mono td-num">{c.to ? fmtMoney(c.to.money_in, acctCcy(c.to.bank_account_id)) : "—"}</TableCell>
                <TableCell className="text-right font-mono td-num">{c.from?.fx_rate ?? c.to?.fx_rate ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!conversionHistory.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No cross-currency transfers yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Add exchange rate</SheetTitle></SheetHeader>
          <div className="py-4 space-y-3">
            <Field label="Rate date">
              <Input type="date" value={edit.rate_date || ""} onChange={(e) => setEdit({ ...edit, rate_date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From">
                <Select value={edit.from_currency || "USD"} onValueChange={(v) => setEdit({ ...edit, from_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CCYS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="To">
                <Select value={edit.to_currency || "HKD"} onValueChange={(v) => setEdit({ ...edit, to_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CCYS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Rate">
              <Input type="number" step="0.000001" value={edit.rate ?? ""} onChange={(e) => setEdit({ ...edit, rate: Number(e.target.value) })} />
            </Field>
            <Field label="Source">
              <Input value={edit.source || ""} onChange={(e) => setEdit({ ...edit, source: e.target.value })} placeholder="manual / bank / api" />
            </Field>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
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
