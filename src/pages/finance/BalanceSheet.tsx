import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { generateBalanceSheetPDF } from "@/utils/financePdfReports";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
};
const fmtSigned = (n: number) => n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n);

interface BSRow { account_id: string; code: string; name: string; account_type: string; entry_date: string; amount: number; }
interface PLRow { account_type: string; amount: number; }

export default function BalanceSheet() {
  const today = new Date();
  const [params, setParams] = useSearchParams();
  const asOf = params.get("asOf") || today.toISOString().slice(0, 10);
  const setAsOf = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("asOf", v);
    setParams(next, { replace: true });
  };
  const [bsRows, setBsRows] = useState<BSRow[]>([]);
  const [plRows, setPlRows] = useState<PLRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId, loading: tenantLoading } = useActiveTenant();


  useEffect(() => {
    if (tenantLoading) return;
    if (!tenantId) { setBsRows([]); setPlRows([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [bsAll, plAll] = await Promise.all([
        fetchAllRows("v_balance_sheet", "account_id,code,name,account_type,entry_date,amount", undefined, tenantId),
        fetchAllRows("v_pl", "account_type,entry_date,amount", undefined, tenantId),
      ]);
      if (cancelled) return;
      setBsRows(((bsAll as unknown) as BSRow[]).filter((r) => r.entry_date <= asOf));
      setPlRows(((plAll as unknown) as (PLRow & { entry_date: string })[]).filter((r) => r.entry_date <= asOf));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [asOf, tenantId, tenantLoading]);

  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, { code: string; name: string; total: number }>>();
    bsRows.forEach((r) => {
      const t = m.get(r.account_type) || new Map();
      const cur = t.get(r.account_id) || { code: r.code, name: r.name, total: 0 };
      cur.total += Number(r.amount);
      t.set(r.account_id, cur);
      m.set(r.account_type, t);
    });
    return m;
  }, [bsRows]);

  const retained = useMemo(() => {
    let income = 0, expense = 0;
    plRows.forEach((r) => {
      if (["revenue", "other_income"].includes(r.account_type)) income += Number(r.amount);
      else expense += Number(r.amount);
    });
    return income - expense;
  }, [plRows]);

  const renderSection = (type: string, label: string) => {
    const accs = Array.from((grouped.get(type) || new Map()).values())
      .filter((a) => Math.abs(a.total) > 0.005)
      .sort((a, b) => a.code.localeCompare(b.code));
    const subtotal = accs.reduce((s, a) => s + a.total, 0);
    return { accs, subtotal, label };
  };

  const assets = renderSection("asset", "Assets");
  const liabilities = renderSection("liability", "Liabilities");
  const equityBase = renderSection("equity", "Equity");
  const totalEquity = equityBase.subtotal + retained;
  const totalLE = liabilities.subtotal + totalEquity;
  const diff = assets.subtotal - totalLE;
  const balanced = Math.round(diff * 100) === 0;

  const exportCsv = () => {
    const rows: any[] = [];
    [assets, liabilities, equityBase].forEach((sec) => {
      rows.push({ section: sec.label, code: "", name: "", amount: "" });
      sec.accs.forEach((a) => rows.push({ section: "", code: a.code, name: a.name, amount: a.total.toFixed(2) }));
      rows.push({ section: "", code: "", name: `Total ${sec.label}`, amount: sec.subtotal.toFixed(2) });
    });
    rows.push({ section: "", code: "", name: "Retained Earnings (computed)", amount: retained.toFixed(2) });
    rows.push({ section: "", code: "", name: "Total Equity", amount: totalEquity.toFixed(2) });
    rows.push({ section: "", code: "", name: "Total Liab + Equity", amount: totalLE.toFixed(2) });
    downloadCSV(rows, [
      { key: "section", label: "Section" },
      { key: "code", label: "Code" },
      { key: "name", label: "Account" },
      { key: "amount", label: "Amount" },
    ], `balance_sheet_${asOf}`);
  };

  const exportPdf = () => {
    generateBalanceSheetPDF({
      asOf,
      assets: { title: "Assets", accounts: assets.accs, subtotal: assets.subtotal },
      liabilities: { title: "Liabilities", accounts: liabilities.accs, subtotal: liabilities.subtotal },
      equity: { title: "Equity", accounts: equityBase.accs, subtotal: equityBase.subtotal },
      retainedEarnings: retained,
      totalEquity,
      totalLE,
      balanced,
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground mt-1">Snapshot of assets, liabilities, and equity, derived from posted journal entries.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">As of</label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-44" />
          <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
          <Button size="sm" onClick={exportPdf}><FileText className="h-4 w-4 mr-1" /> PDF</Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground -mt-2">As of {fmtDate(asOf)}</p>

      {!loading && bsRows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="Total Assets" value={`HK$ ${fmtWhole(assets.subtotal)}`} />
          <StatTile label="Total Liab + Equity" value={`HK$ ${fmtWhole(totalLE)}`} />
          <StatTile
            label="Equation check"
            value={balanced ? "Balanced" : `HK$ ${fmtWhole(Math.abs(diff))}`}
            tone={balanced ? "primary" : "destructive"}
            icon={balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="card-glass p-5"><Skeleton className="h-64 w-full" /></Card>
          <Card className="card-glass p-5"><Skeleton className="h-64 w-full" /></Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-glass p-5">
              <Section title="Assets" accs={assets.accs} subtotal={assets.subtotal} />
            </Card>
            <Card className="card-glass p-5 space-y-6">
              <Section title="Liabilities" accs={liabilities.accs} subtotal={liabilities.subtotal} />
              <Section
                title="Equity"
                accs={equityBase.accs}
                subtotal={equityBase.subtotal}
                extra={{ label: "Retained Earnings (P&L to date)", value: retained }}
                overrideSubtotal={totalEquity}
              />
              <div className="pt-3 mt-3 border-t-2 border-double border-foreground/40">
                <div className="flex justify-between text-sm font-bold">
                  <span>Total Liabilities + Equity</span>
                  <span className="tabular-nums">{fmtSigned(totalLE)}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card className={cn(
            "card-glass p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3",
            !balanced && "border-destructive/40",
          )}>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Assets</div>
              <div className="text-2xl font-display font-semibold tabular-nums">HK$ {fmt(assets.subtotal)}</div>
            </div>
            <div className={cn(
              "text-sm font-semibold inline-flex items-center gap-1.5",
              balanced ? "text-primary" : "text-destructive",
            )}>
              {balanced
                ? <><CheckCircle2 className="h-4 w-4" /> Balanced</>
                : <><AlertTriangle className="h-4 w-4" /> Out of balance by HK$ {fmt(Math.abs(diff))}</>}
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Liabilities + Equity</div>
              <div className="text-2xl font-display font-semibold tabular-nums">HK$ {fmt(totalLE)}</div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, icon }: { label: string; value: string; tone?: "primary" | "destructive"; icon?: React.ReactNode }) {
  const toneCls = tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="card-glass p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className={cn("text-xl font-display font-semibold mt-1 tabular-nums", toneCls)}>{value}</div>
    </Card>
  );
}

function Section({
  title, accs, subtotal, extra, overrideSubtotal,
}: {
  title: string;
  accs: { code: string; name: string; total: number }[];
  subtotal: number;
  extra?: { label: string; value: number };
  overrideSubtotal?: number;
}) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-1">
        {accs.length === 0 && !extra && <p className="text-xs text-muted-foreground italic py-1">No balances</p>}
        {accs.map((a) => {
          const neg = a.total < 0;
          return (
            <div key={a.code} className="flex justify-between text-sm border-b border-border/30 py-1.5 gap-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-xs text-muted-foreground mr-2">{a.code}</span>
                {a.name}
              </span>
              <span className={cn("tabular-nums whitespace-nowrap", neg && "text-destructive")}>{fmtSigned(a.total)}</span>
            </div>
          );
        })}
        {extra && (
          <div className="flex justify-between text-sm border-b border-border/30 py-1.5 italic text-muted-foreground gap-2">
            <span className="min-w-0 flex-1">{extra.label}</span>
            <span className={cn("tabular-nums whitespace-nowrap", extra.value < 0 && "text-destructive")}>{fmtSigned(extra.value)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold border-t border-foreground/40 pt-2 mt-2 gap-2">
          <span>Total {title}</span>
          <span className="tabular-nums whitespace-nowrap">{fmtSigned(overrideSubtotal ?? subtotal)}</span>
        </div>
      </div>
    </div>
  );
}
