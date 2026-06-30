import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBankModule } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function BankReconciliationPage() {
  const { accounts, transactions, imports, statementBalanceFor, currentBalanceFor } = useBankModule();
  const [acctId, setAcctId] = useState<string>(accounts[0]?.id || "");
  const [periodId, setPeriodId] = useState<string>("");

  const currentAcct = accounts.find((a) => a.id === acctId);
  const periods = useMemo(
    () => imports.filter((i) => i.bank_account_id === acctId),
    [imports, acctId],
  );
  const period = periods.find((p) => p.id === periodId) || periods[0];

  const periodTxns = useMemo(() => {
    if (!period) return transactions.filter((t) => t.bank_account_id === acctId);
    return transactions.filter(
      (t) => t.bank_account_id === acctId && t.txn_date >= period.period_start && t.txn_date <= period.period_end,
    );
  }, [transactions, acctId, period]);

  const reconciled = periodTxns.filter((t) => t.matched_record_id || t.status === "matched" || t.status === "approved" || t.status === "posted");
  const outstanding = periodTxns.filter((t) => !reconciled.includes(t));
  const progress = periodTxns.length ? (reconciled.length / periodTxns.length) * 100 : 0;

  const systemBal = currentAcct ? currentBalanceFor(currentAcct.id) : 0;
  const stmtBal = currentAcct ? statementBalanceFor(currentAcct.id) : 0;
  const diff = systemBal - stmtBal;

  return (
    <BankPageShell
      title="Bank Reconciliation"
      description="Compare statement balances against system balances and resolve outstanding items."
      actions={
        <div className="flex gap-2">
          <Select value={acctId} onValueChange={setAcctId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Account" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={periodId || (period?.id || "")} onValueChange={setPeriodId}>
            <SelectTrigger className="w-60"><SelectValue placeholder="Period" /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{fmtDate(p.period_start)} → {fmtDate(p.period_end)}</SelectItem>
              ))}
              {!periods.length && <SelectItem disabled value="none">No imports yet</SelectItem>}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm"><Link to="/bank/transactions">All transactions</Link></Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Opening balance" value={fmtMoney(period?.opening_balance ?? currentAcct?.opening_balance ?? 0, currentAcct?.currency)} />
        <BankKpi label="Closing (statement)" value={fmtMoney(stmtBal, currentAcct?.currency)} />
        <BankKpi label="System balance" value={fmtMoney(systemBal, currentAcct?.currency)} />
        <BankKpi label="Difference" value={fmtMoney(diff, currentAcct?.currency)} tone={Math.abs(diff) < 0.01 ? "success" : "warn"} />
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Reconciliation progress</span>
          <span className="text-muted-foreground">{reconciled.length} / {periodTxns.length} matched</span>
        </div>
        <Progress value={progress} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-semibold mb-3">Outstanding items <Badge variant="outline" className="ml-2">{outstanding.length}</Badge></div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {outstanding.slice(0, 60).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{fmtDate(t.txn_date)}</TableCell>
                  <TableCell className="truncate max-w-[260px]">{t.description}</TableCell>
                  <TableCell className={`text-right font-mono td-num ${t.money_in ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtMoney(Number(t.money_in || 0) - Number(t.money_out || 0))}
                  </TableCell>
                </TableRow>
              ))}
              {!outstanding.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nothing outstanding 🎉</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3">Reconciliation history</div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Period</TableHead><TableHead className="text-right">Closing</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{fmtDate(p.period_start)} → {fmtDate(p.period_end)}</TableCell>
                  <TableCell className="text-right font-mono td-num">{fmtMoney(p.closing_balance, currentAcct?.currency)}</TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!periods.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No imports yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </BankPageShell>
  );
}
