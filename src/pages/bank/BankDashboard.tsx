import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useBankModule } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ArrowRight, Wallet, FileWarning } from "lucide-react";

export default function BankDashboard() {
  const {
    loading, accounts, transactions, imports, unmatched, lowConfidence, byCurrency, currentBalanceFor,
  } = useBankModule();

  const totalCash = useMemo(
    () => accounts.reduce((s, a) => s + currentBalanceFor(a.id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, transactions],
  );

  const recentTxns = transactions.slice(0, 8);
  const recentImports = imports.slice(0, 5);

  return (
    <BankPageShell title="Bank Dashboard" description="Live overview of bank balances, reconciliations, and unmatched activity.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Total cash" value={fmtMoney(totalCash)} tone="info" />
        <BankKpi label="Bank accounts" value={accounts.length} sub={`${accounts.filter((a) => a.is_active).length} active`} />
        <BankKpi label="Unmatched txns" value={unmatched.length} tone={unmatched.length ? "warn" : "default"} />
        <BankKpi label="Low confidence" value={lowConfidence.length} tone={lowConfidence.length ? "danger" : "default"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" /> Cash by currency</div>
            <Link to="/bank/accounts" className="text-xs text-primary hover:underline flex items-center gap-1">
              Manage accounts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byCurrency).map(([ccy, bal]) => (
                <TableRow key={ccy}>
                  <TableCell className="font-medium">{ccy}</TableCell>
                  <TableCell className="text-right font-mono td-num">{fmtMoney(bal, ccy)}</TableCell>
                </TableRow>
              ))}
              {!Object.keys(byCurrency).length && (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No bank accounts yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alerts &amp; exceptions</div>
            <Link to="/bank/unmatched" className="text-xs text-primary hover:underline">View unmatched →</Link>
          </div>
          <div className="space-y-2 text-sm">
            <Alert label={`${unmatched.length} transactions need a match`} to="/bank/unmatched" />
            <Alert label={`${lowConfidence.length} low-confidence suggested matches`} to="/bank/matching" />
            <Alert
              label={`${accounts.filter((a) => !a.last_reconciled_date).length} accounts never reconciled`}
              to="/bank/reconciliation"
            />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-semibold mb-3">Recent transactions</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTxns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{fmtDate(t.txn_date)}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{t.description}</TableCell>
                  <TableCell className="text-right font-mono td-num text-emerald-600">{t.money_in ? fmtMoney(t.money_in, "") : ""}</TableCell>
                  <TableCell className="text-right font-mono td-num text-rose-600">{t.money_out ? fmtMoney(t.money_out, "") : ""}</TableCell>
                  <TableCell><Badge variant="outline">{t.status || "—"}</Badge></TableCell>
                </TableRow>
              ))}
              {!recentTxns.length && !loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3 flex items-center gap-2"><FileWarning className="h-4 w-4" /> Recent imports</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentImports.map((i) => {
                const acct = accounts.find((a) => a.id === i.bank_account_id);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="truncate max-w-[200px]">{acct?.account_name || "—"}</TableCell>
                    <TableCell>{fmtDate(i.period_start)} → {fmtDate(i.period_end)}</TableCell>
                    <TableCell className="text-right font-mono td-num">{fmtMoney(i.closing_balance, acct?.currency || "HKD")}</TableCell>
                    <TableCell><Badge variant="outline">{i.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
              {!recentImports.length && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No statement imports yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-3 text-right">
            <Button asChild size="sm" variant="outline">
              <Link to="/bank/reconciliation">Go to reconciliation</Link>
            </Button>
          </div>
        </Card>
      </div>
    </BankPageShell>
  );
}

function Alert({ label, to }: { label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent/50 transition">
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
