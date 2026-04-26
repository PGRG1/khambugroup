import { useState, useMemo } from "react";
import { useTrialBalance } from "@/hooks/useTrialBalance";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { ACCOUNT_TYPE_LABEL } from "@/hooks/useChartOfAccounts";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];

export default function TrialBalance() {
  const today = new Date();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
  const { rows, loading } = useTrialBalance({ fromDate: fromDate || undefined, toDate: toDate || undefined });

  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>();
    TYPE_ORDER.forEach((t) => m.set(t, []));
    rows.forEach((r) => {
      if (Number(r.total_debit) === 0 && Number(r.total_credit) === 0) return;
      m.get(r.account_type)?.push(r);
    });
    return m;
  }, [rows]);

  const totals = useMemo(() => ({
    debit: rows.reduce((s, r) => s + Number(r.total_debit), 0),
    credit: rows.reduce((s, r) => s + Number(r.total_credit), 0),
  }), [rows]);

  const exportCsv = () => {
    downloadCSV(
      rows.filter((r) => Number(r.total_debit) || Number(r.total_credit)).map((r) => ({
        code: r.code, name: r.name, type: r.account_type,
        debit: Number(r.total_debit).toFixed(2),
        credit: Number(r.total_credit).toFixed(2),
        balance: Number(r.balance).toFixed(2),
      })),
      [
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "type", label: "Type" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
        { key: "balance", label: "Balance" },
      ],
      "trial_balance",
    );
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
          <p className="text-sm text-muted-foreground mt-1">Total debits and credits per account. The bottom row should always balance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" placeholder="From" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" placeholder="To" />
          <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </header>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? <div className="p-12 text-center text-muted-foreground">Loading…</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TYPE_ORDER.map((t) => {
                const list = grouped.get(t) || [];
                if (list.length === 0) return null;
                return (
                  <>
                    <TableRow key={`h-${t}`} className="bg-muted/40">
                      <TableCell colSpan={5} className="font-semibold text-xs uppercase text-muted-foreground">{ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL]}</TableCell>
                    </TableRow>
                    {list.map((r) => (
                      <TableRow key={r.account_id}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="text-sm">{r.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(r.total_debit) ? fmt(Number(r.total_debit)) : ""}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(r.total_credit) ? fmt(Number(r.total_credit)) : ""}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{fmt(Number(r.balance))}</TableCell>
                      </TableRow>
                    ))}
                  </>
                );
              })}
            </TableBody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-double border-foreground/40">
                <TableRow>
                  <TableCell colSpan={2} className="font-bold">Totals</TableCell>
                  <TableCell className="text-right font-mono font-bold">{fmt(totals.debit)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{fmt(totals.credit)}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${Math.round((totals.debit - totals.credit) * 100) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {Math.round((totals.debit - totals.credit) * 100) === 0 ? "✓ Balanced" : fmt(totals.debit - totals.credit)}
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        )}
      </Card>
    </div>
  );
}
