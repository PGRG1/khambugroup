import { kpiValueSizeClass } from "@/utils/kpiSize";
import React, { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTrialBalance } from "@/hooks/useTrialBalance";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, FileText, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { ACCOUNT_TYPE_LABEL } from "@/hooks/useChartOfAccounts";
import { generateTrialBalancePDF } from "@/utils/financePdfReports";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
};

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];

/** Given a period [from,to], compute a "prior period" of equal length ending the day before `from`.
 *  If no `from`, prior = same `to` shifted back exactly one year. */
function priorPeriod(from: string | undefined, to: string): { from?: string; to: string } {
  const toDate = new Date(to);
  if (!from) {
    const priorTo = new Date(toDate); priorTo.setFullYear(priorTo.getFullYear() - 1);
    return { to: priorTo.toISOString().slice(0, 10) };
  }
  const fromDate = new Date(from);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
  const priorTo = new Date(fromDate); priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = new Date(priorTo); priorFrom.setDate(priorFrom.getDate() - days);
  return { from: priorFrom.toISOString().slice(0, 10), to: priorTo.toISOString().slice(0, 10) };
}

export default function TrialBalance() {
  const today = new Date();
  const [params, setParams] = useSearchParams();
  const fromDate = params.get("from") || "";
  const toDate = params.get("to") || today.toISOString().slice(0, 10);
  const compareOn = params.get("compare") !== "off";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === "") next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const { rows, loading } = useTrialBalance({ fromDate: fromDate || undefined, toDate: toDate || undefined });

  const prior = useMemo(() => priorPeriod(fromDate || undefined, toDate), [fromDate, toDate]);
  const { rows: priorRows, loading: priorLoading } = useTrialBalance(
    compareOn ? { fromDate: prior.from, toDate: prior.to } : { fromDate: undefined, toDate: undefined }
  );
  const priorBalance = useMemo(() => {
    const m = new Map<string, number>();
    if (!compareOn) return m;
    priorRows.forEach((r) => m.set(r.account_id, Number(r.balance) || 0));
    return m;
  }, [priorRows, compareOn]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>();
    TYPE_ORDER.forEach((t) => m.set(t, []));
    rows.forEach((r) => {
      if (Number(r.total_debit) === 0 && Number(r.total_credit) === 0 && !priorBalance.get(r.account_id)) return;
      m.get(r.account_type)?.push(r);
    });
    return m;
  }, [rows, priorBalance]);

  const totals = useMemo(() => ({
    debit: rows.reduce((s, r) => s + Number(r.total_debit), 0),
    credit: rows.reduce((s, r) => s + Number(r.total_credit), 0),
  }), [rows]);

  const diff = totals.debit - totals.credit;
  const isBalanced = Math.round(diff * 100) === 0;

  const exportCsv = () => {
    downloadCSV(
      rows.filter((r) => Number(r.total_debit) || Number(r.total_credit)).map((r) => ({
        code: r.code, name: r.name, type: r.account_type,
        debit: Number(r.total_debit).toFixed(2),
        credit: Number(r.total_credit).toFixed(2),
        balance: Number(r.balance).toFixed(2),
        prior: (priorBalance.get(r.account_id) || 0).toFixed(2),
      })),
      [
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "type", label: "Type" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
        { key: "balance", label: "Balance" },
        { key: "prior", label: "Prior period" },
      ],
      "trial_balance",
    );
  };

  const exportPdf = () => {
    const groups = TYPE_ORDER
      .map((t) => ({
        type: t,
        label: ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL],
        rows: (grouped.get(t) || []).map((r) => ({
          code: r.code, name: r.name, account_type: r.account_type,
          total_debit: Number(r.total_debit),
          total_credit: Number(r.total_credit),
          balance: Number(r.balance),
        })),
      }))
      .filter((g) => g.rows.length > 0);
    generateTrialBalancePDF({
      fromDate: fromDate || undefined,
      toDate,
      rows: rows as any,
      groups,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
    });
  };

  const scopeLabel = `${fromDate ? fmtDate(fromDate) : "Beginning"} → ${fmtDate(toDate)}`;
  const priorLabel = `${prior.from ? fmtDate(prior.from) : "Beginning"} → ${fmtDate(prior.to)}`;

  const ledgerLink = (accountId: string) =>
    `/finance/ledger?account=${accountId}${fromDate ? `&from=${fromDate}` : ""}${toDate ? `&to=${toDate}` : ""}`;

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Trial Balance</h1>
          <p className="text-sm text-muted-foreground mt-1">Total debits and credits per account. The bottom row must always balance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setParam("from", e.target.value)} className="h-9 w-40" placeholder="From" />
          <Input type="date" value={toDate} onChange={(e) => setParam("to", e.target.value)} className="h-9 w-40" placeholder="To" />
          <Button
            size="sm"
            variant={compareOn ? "default" : "outline"}
            onClick={() => setParam("compare", compareOn ? "off" : null)}
            title={compareOn ? `Comparing to ${priorLabel}` : "Enable prior-period comparison"}
          >
            Compare
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
          <Button size="sm" onClick={exportPdf}><FileText className="h-4 w-4 mr-1" /> PDF</Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground -mt-2">
        {scopeLabel}
        {compareOn && <span className="ml-3 opacity-80">vs prior: {priorLabel}</span>}
      </p>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="Total debits" value={`HK$ ${fmtWhole(totals.debit)}`} />
          <StatTile label="Total credits" value={`HK$ ${fmtWhole(totals.credit)}`} />
          <StatTile
            label="Difference"
            value={isBalanced ? "Balanced" : `HK$ ${fmtWhole(Math.abs(diff))}`}
            tone={isBalanced ? "primary" : "destructive"}
            icon={isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Desktop table */}
      <Card className="card-glass p-0 overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right w-36">Debit</TableHead>
              <TableHead className="text-right w-36">Credit</TableHead>
              <TableHead className="text-right w-36">Balance</TableHead>
              {compareOn && <TableHead className="text-right w-36">Prior</TableHead>}
              {compareOn && <TableHead className="text-right w-32">Δ</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`s-${i}`}><TableCell colSpan={compareOn ? 7 : 5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ))}
            {!loading && TYPE_ORDER.map((t) => {
              const list = grouped.get(t) || [];
              if (list.length === 0) return null;
              return (
                <React.Fragment key={t}>
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={compareOn ? 7 : 5} className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground py-2">
                      {ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL]}
                    </TableCell>
                  </TableRow>
                  {list.map((r) => {
                    const bal = Number(r.balance);
                    const priorBal = priorBalance.get(r.account_id) || 0;
                    const delta = bal - priorBal;
                    return (
                      <TableRow key={r.account_id} className="group">
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                        <TableCell className="text-sm">
                          <Link
                            to={ledgerLink(r.account_id)}
                            className="inline-flex items-center gap-1.5 hover:text-primary hover:underline underline-offset-2"
                          >
                            {r.name}
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{Number(r.total_debit) ? fmt(Number(r.total_debit)) : ""}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{Number(r.total_credit) ? fmt(Number(r.total_credit)) : ""}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{fmt(bal)}</TableCell>
                        {compareOn && (
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                            {priorLoading ? "…" : (priorBal ? fmt(priorBal) : "—")}
                          </TableCell>
                        )}
                        {compareOn && (
                          <TableCell className={cn(
                            "text-right tabular-nums text-xs",
                            delta > 0.005 ? "text-primary" : delta < -0.005 ? "text-destructive" : "text-muted-foreground"
                          )}>
                            {priorLoading ? "" : (Math.abs(delta) < 0.005 ? "—" : `${delta > 0 ? "+" : ""}${fmt(delta)}`)}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </TableBody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <TableRow className="border-t-2 border-double border-foreground/40">
                <TableCell colSpan={2} className="font-bold text-xs uppercase text-muted-foreground">Totals</TableCell>
                <TableCell className="text-right tabular-nums font-bold">{fmt(totals.debit)}</TableCell>
                <TableCell className="text-right tabular-nums font-bold">{fmt(totals.credit)}</TableCell>
                <TableCell className={cn("text-right tabular-nums font-bold", isBalanced ? "text-primary" : "text-destructive")}>
                  {isBalanced ? "✓ Balanced" : fmt(diff)}
                </TableCell>
                {compareOn && <TableCell />}
                {compareOn && <TableCell />}
              </TableRow>
            </tfoot>
          )}
        </Table>
      </Card>

      {/* Mobile: grouped card list */}
      <div className="md:hidden space-y-4">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <Card key={`ms-${i}`} className="card-glass p-4"><Skeleton className="h-16 w-full" /></Card>
        ))}
        {!loading && TYPE_ORDER.map((t) => {
          const list = grouped.get(t) || [];
          if (list.length === 0) return null;
          return (
            <div key={t}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold px-1 mb-2">
                {ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL]}
              </div>
              <Card className="card-glass divide-y divide-border/40">
                {list.map((r) => {
                  const bal = Number(r.balance);
                  const priorBal = priorBalance.get(r.account_id) || 0;
                  const delta = bal - priorBal;
                  return (
                    <Link
                      key={r.account_id}
                      to={ledgerLink(r.account_id)}
                      className="p-3 flex items-start justify-between gap-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{r.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{r.code}</div>
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums text-sm font-medium">{fmt(bal)}</div>
                        {compareOn && Math.abs(delta) > 0.005 && (
                          <div className={cn(
                            "text-[10px] tabular-nums mt-0.5",
                            delta > 0 ? "text-primary" : "text-destructive"
                          )}>
                            {delta > 0 ? "+" : ""}{fmt(delta)}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </Card>
            </div>
          );
        })}
        {!loading && rows.length > 0 && (
          <Card className={cn("card-glass p-4 border-t-2 border-double", isBalanced ? "border-foreground/40" : "border-destructive")}>
            <div className="flex justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>Total debits</span><span className="tabular-nums font-semibold text-foreground">{fmt(totals.debit)}</span>
            </div>
            <div className="flex justify-between text-xs uppercase tracking-wide text-muted-foreground mt-1">
              <span>Total credits</span><span className="tabular-nums font-semibold text-foreground">{fmt(totals.credit)}</span>
            </div>
            <div className={cn("flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-border/60", isBalanced ? "text-primary" : "text-destructive")}>
              <span>{isBalanced ? "Balanced ✓" : "Out of balance by"}</span>
              {!isBalanced && <span className="tabular-nums">HK$ {fmt(Math.abs(diff))}</span>}
            </div>
          </Card>
        )}
      </div>

      {!loading && rows.length > 0 && !isBalanced && (
        <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Out of balance by HK$ {fmt(Math.abs(diff))} — check for unposted or unbalanced entries in the Journal.</p>
      )}
      {!loading && rows.length > 0 && isBalanced && (
        <p className="text-xs text-primary flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Books are balanced.</p>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, icon }: { label: string; value: string; tone?: "primary" | "destructive"; icon?: React.ReactNode }) {
  const toneCls = tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="card-glass p-3 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground min-w-0">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={cn("font-display font-semibold mt-1 tabular-nums whitespace-nowrap min-w-0", kpiValueSizeClass(value), toneCls)} title={value}>{value}</div>
    </Card>
  );
}
