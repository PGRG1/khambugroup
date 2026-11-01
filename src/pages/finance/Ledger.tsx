import { formatDecimal, formatDate, formatCurrency } from "@/utils/format";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams,Link } from "react-router-dom";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, BookOpen } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { cn } from "@/lib/utils";

const fmt = formatDecimal;
const fmtWhole = (n:number) => formatDecimal(n,0);
const fmtDate = (v:string|null|undefined) => v ? formatDate(v) : '—';

interface GLRow {
  entry_id: string;
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
  const { tenantId } = useActiveTenant();
  const [params, setParams] = useSearchParams();
  const today = new Date();
  const accountId = params.get("account") || "";
  const fromDate = params.get("from") ?? `${today.getFullYear()}-01-01`;
  const toDate = params.get("to") ?? "";
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === "") next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };
  const setAccountId = (v: string) => setParam("account", v || null);
  const setFromDate = (v: string) => setParam("from", v);
  const setToDate = (v: string) => setParam("to", v);
  const [rows, setRows] = useState<GLRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening,setOpening]=useState(0);


  useEffect(() => {
    if (!accountId || !tenantId) { setRows([]); setOpening(0); return; }
    setLoading(true);
    let cancelled = false;
    (async () => {
      // fetchAllRows bypasses PostgREST's 1000-row cap by paging with range()
      const all = await fetchAllRows(
        "v_general_ledger",
        "*",
        { col: "entry_date", asc: true },
        tenantId,
      );
      if (cancelled) return;
      const filtered = (all as GLRow[]).filter((r: any) =>
        r.account_id === accountId &&
        (!fromDate || r.entry_date >= fromDate) &&
        (!toDate || r.entry_date <= toDate)
      );
      setOpening((all as GLRow[]).filter(r=>r.account_id===accountId&&!!fromDate&&r.entry_date<fromDate).reduce((n,r)=>n+(r.normal_side==='credit'?Number(r.credit)-Number(r.debit):Number(r.debit)-Number(r.credit)),0));
      setRows(filtered);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [accountId, fromDate, toDate, tenantId]);

  const account = accounts.find((a) => a.id === accountId);

  const withRunning = useMemo(() => {
    let bal = opening;
    return rows.map((r) => {
      const delta = account?.normal_side === "credit" ? Number(r.credit) - Number(r.debit) : Number(r.debit) - Number(r.credit);
      bal += delta;
      return { ...r, running: bal };
    });
  }, [rows, account,opening]);

  const totals = useMemo(() => ({
    debit: rows.reduce((s, r) => s + Number(r.debit), 0),
    credit: rows.reduce((s, r) => s + Number(r.credit), 0),
  }), [rows]);

  const closing = withRunning[withRunning.length - 1]?.running ?? opening;

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

  const scopeLabel = `${fromDate ? fmtDate(fromDate) : "Beginning"} → ${toDate ? fmtDate(toDate) : "Today"}`;

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">Posted entries · running balance</p>
        </div>

        {/* Primary control: account selector */}
        <Card className="card-glass p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Account</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-10 mt-1 md:w-[420px]"><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.is_active).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs mr-2">{a.code}</span>{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!account}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
            </div>
          </div>
          {account && <p className="text-xs text-muted-foreground mt-3">{scopeLabel} · Normal side <span className="uppercase">{account.normal_side}</span></p>}
        </Card>

        {account && <p className="text-sm text-muted-foreground">{rows.length} lines · Debits {formatCurrency(totals.debit)} · Credits {formatCurrency(totals.credit)} · Closing {formatCurrency(closing)}</p>}

      </header>

      {!accountId ? (
        <Card className="card-glass p-12 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Choose an account to view its ledger</p>
          <p className="text-xs text-muted-foreground mt-1">Select any active account above to see every posted debit and credit with a running balance.</p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="card-glass p-0 overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-28">Source</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right w-32">Debit</TableHead>
                  <TableHead className="text-right w-32">Credit</TableHead>
                  <TableHead className="text-right w-36">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`s-${i}`}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))}
                {!loading && withRunning.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transactions in this range.</TableCell></TableRow>
                )}
                {!loading && withRunning.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.entry_date)}</TableCell>
                    <TableCell><span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{r.source_type}</span></TableCell>
                    <TableCell className="text-sm"><Link className="text-primary underline" to={`/finance/books?view=journal&entry=${r.entry_id}`}>{r.entry_memo}</Link>{r.line_memo ? <span className="text-muted-foreground"> — {r.line_memo}</span> : null}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{Number(r.debit) ? fmt(Number(r.debit)) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{Number(r.credit) ? fmt(Number(r.credit)) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">{fmt(r.running)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {rows.length > 0 && !loading && (
                <tfoot>
                  <TableRow className="border-t-2 border-double border-foreground/40">
                    <TableCell colSpan={3} className="font-semibold text-xs uppercase text-muted-foreground">Totals</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(totals.debit)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(totals.credit)}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{fmt(closing)}</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </Card>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <Card key={`ms-${i}`} className="card-glass p-4"><Skeleton className="h-12 w-full" /></Card>
            ))}
            {!loading && withRunning.length === 0 && (
              <Card className="card-glass p-6 text-center text-sm text-muted-foreground">No transactions in this range.</Card>
            )}
            {!loading && withRunning.map((r, i) => (
              <Card key={i} className="card-glass p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{r.source_type}</span>
                      <span className="text-muted-foreground">{fmtDate(r.entry_date)}</span>
                    </div>
                    <div className="text-sm mt-1">{r.entry_memo}</div>
                    {r.line_memo && <div className="text-xs text-muted-foreground">{r.line_memo}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn("text-sm tabular-nums", Number(r.debit) ? "" : "text-muted-foreground")}>
                      {Number(r.debit) ? `Dr ${fmt(Number(r.debit))}` : `Cr ${fmt(Number(r.credit))}`}
                    </div>
                    <div className="text-xs tabular-nums font-semibold mt-1">{fmt(r.running)}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
