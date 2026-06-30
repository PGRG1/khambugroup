import { useMemo } from "react";
import { useBankModule } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export default function BankFeesPage() {
  const { feesAndCharges, accounts, classify, updateTxn } = useBankModule();

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of feesAndCharges) {
      const c = classify(t);
      const type = c?.suggested_type || "other";
      out[type] = (out[type] || 0) + Number(t.money_out || 0) - Number(t.money_in || 0);
    }
    return out;
  }, [feesAndCharges, classify]);

  const grand = Object.values(totals).reduce((s, n) => s + n, 0);

  return (
    <BankPageShell
      title="Bank Fees &amp; Charges"
      description="Transactions classified as bank charges, merchant fees, interest and service fees."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Fee transactions" value={feesAndCharges.length} />
        <BankKpi label="Net charges" value={fmtMoney(grand)} tone={grand >= 0 ? "danger" : "success"} />
        <BankKpi label="Distinct types" value={Object.keys(totals).length} />
        <BankKpi label="Approved" value={feesAndCharges.filter((t) => t.status === "approved" || t.status === "posted").length} tone="success" />
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3">Totals by type</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(totals).map(([k, v]) => (
            <div key={k} className="rounded border p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-mono font-semibold td-num mt-1">{fmtMoney(v)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead>
            <TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Approve</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {feesAndCharges.slice(0, 500).map((t) => {
              const cls = classify(t);
              const acct = accounts.find((a) => a.id === t.bank_account_id);
              const amt = Number(t.money_in || 0) - Number(t.money_out || 0);
              return (
                <TableRow key={t.id}>
                  <TableCell>{fmtDate(t.txn_date)}</TableCell>
                  <TableCell className="truncate max-w-[160px]">{acct?.account_name}</TableCell>
                  <TableCell className="truncate max-w-[300px]">{t.description}</TableCell>
                  <TableCell>{cls?.suggested_type ? <Badge variant="secondary">{cls.suggested_type}</Badge> : "—"}</TableCell>
                  <TableCell className={`text-right font-mono td-num ${amt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(amt, acct?.currency)}</TableCell>
                  <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {t.status !== "approved" && t.status !== "posted" && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        try { await updateTxn(t.id, { status: "approved" }); toast.success("Approved"); }
                        catch (e: any) { toast.error(e.message); }
                      }}>Approve</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!feesAndCharges.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No fee transactions identified</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </BankPageShell>
  );
}
