import { useMemo, useState, useEffect } from "react";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface GLRow {
  entry_date: string;
  entry_memo: string;
  source_type: string;
  account_id: string;
  account_code: string;
  account_name: string;
  normal_side: "debit" | "credit";
  debit: number;
  credit: number;
  line_memo: string;
}

export default function Ledger() {
  const { items: accounts } = useChartOfAccounts();
  const [accountId, setAccountId] = useState<string>("");
  const today = new Date();
  const [fromDate, setFromDate] = useState(`${today.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState<GLRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) { setRows([]); return; }
    setLoading(true);
    let q: any = supabase.from("v_general_ledger" as any).select("*").eq("account_id", accountId).order("entry_date", { ascending: true });
    if (fromDate) q = q.gte("entry_date", fromDate);
    if (toDate) q = q.lte("entry_date", toDate);
    q.limit(5000).then(({ data }: any) => {
      setRows((data as GLRow[]) ?? []);
      setLoading(false);
    });
  }, [accountId, fromDate, toDate]);

  const account = accounts.find((a) => a.id === accountId);

  const withRunning = useMemo(() => {
    let bal = 0;
    return rows.map((r) => {
      const delta = account?.normal_side === "credit" ? Number(r.credit) - Number(r.debit) : Number(r.debit) - Number(r.credit);
      bal += delta;
      return { ...r, running: bal };
    });
  }, [rows, account]);

  const totals = useMemo(() => ({
    debit: rows.reduce((s, r) => s + Number(r.debit), 0),
    credit: rows.reduce((s, r) => s + Number(r.credit), 0),
  }), [rows]);

  const exportCsv = () => {
    if (!account) return;
    downloadCSV(
      withRunning.map((r) => ({
        date: r.entry_date,
        source: r.source_type,
        memo: r.entry_memo + (r.line_memo ? ` — ${r.line_memo}` : ""),
        debit: Number(r.debit).toFixed(2),
        credit: Number(r.credit).toFixed(2),
        balance: r.running.toFixed(2),
      })),
      [
        { key: "date", label: "Date" },
        { key: "source", label: "Source" },
        { key: "memo", label: "Memo" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
        { key: "balance", label: "Balance" },
      ],
      `ledger_${account.code}`,
    );
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">General Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">All posted transactions for the selected account, with running balance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-9 w-[280px]"><SelectValue placeholder="Select account…" /></SelectTrigger>
            <SelectContent>
              {accounts.filter((a) => a.is_active).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!account}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </header>

      <Card className="card-glass p-0 overflow-hidden">
        {!accountId ? (
          <div className="p-12 text-center text-muted-foreground">Choose an account to view its ledger.</div>
        ) : loading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withRunning.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No transactions.</TableCell></TableRow>}
              {withRunning.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{r.entry_date}</TableCell>
                  <TableCell><span className="text-xs px-1.5 py-0.5 rounded bg-muted">{r.source_type}</span></TableCell>
                  <TableCell className="text-sm">{r.entry_memo}{r.line_memo ? <span className="text-muted-foreground"> — {r.line_memo}</span> : null}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.debit) ? fmt(Number(r.debit)) : ""}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(r.credit) ? fmt(Number(r.credit)) : ""}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">{fmt(r.running)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-double border-foreground/40">
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmt(totals.debit)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmt(totals.credit)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{fmt(withRunning[withRunning.length - 1]?.running ?? 0)}</TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        )}
      </Card>
    </div>
  );
}
