import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileDown, FileText } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { generateBalanceSheetPDF } from "@/utils/financePdfReports";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface BSRow { account_id: string; code: string; name: string; account_type: string; entry_date: string; amount: number; }
interface PLRow { account_type: string; amount: number; }

export default function BalanceSheet() {
  const today = new Date();
  const [asOf, setAsOf] = useState(today.toISOString().slice(0, 10));
  const [bsRows, setBsRows] = useState<BSRow[]>([]);
  const [plRows, setPlRows] = useState<PLRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Fetch ALL rows (bypass 1000-row PostgREST cap), then filter by asOf client-side
      const [bsAll, plAll] = await Promise.all([
        fetchAllRows("v_balance_sheet", "account_id,code,name,account_type,entry_date,amount"),
        fetchAllRows("v_pl", "account_type,entry_date,amount"),
      ]);
      if (cancelled) return;
      setBsRows(((bsAll as unknown) as BSRow[]).filter((r) => r.entry_date <= asOf));
      setPlRows(((plAll as unknown) as (PLRow & { entry_date: string })[]).filter((r) => r.entry_date <= asOf));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [asOf]);

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
    const accs = Array.from((grouped.get(type) || new Map()).values()).filter((a) => Math.abs(a.total) > 0.005).sort((a, b) => a.code.localeCompare(b.code));
    const subtotal = accs.reduce((s, a) => s + a.total, 0);
    return { accs, subtotal, label };
  };

  const assets = renderSection("asset", "Assets");
  const liabilities = renderSection("liability", "Liabilities");
  const equityBase = renderSection("equity", "Equity");
  const totalEquity = equityBase.subtotal + retained;
  const totalLE = liabilities.subtotal + totalEquity;
  const balanced = Math.round((assets.subtotal - totalLE) * 100) === 0;

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

  const Section = ({ title, accs, subtotal, suffix }: { title: string; accs: { code: string; name: string; total: number }[]; subtotal: number; suffix?: React.ReactNode }) => (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-1">
        {accs.length === 0 && <p className="text-xs text-muted-foreground italic">No balances</p>}
        {accs.map((a) => (
          <div key={a.code} className="flex justify-between text-sm border-b border-border/30 py-1">
            <span><span className="font-mono text-xs text-muted-foreground mr-2">{a.code}</span>{a.name}</span>
            <span className="font-mono">{fmt(a.total)}</span>
          </div>
        ))}
        {suffix}
        <div className="flex justify-between font-bold border-t-2 border-foreground/40 pt-2 mt-2">
          <span>Total {title}</span>
          <span className="font-mono">{fmt(subtotal + (suffix ? retained : 0))}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground mt-1">Snapshot of assets, liabilities, and equity, derived from posted journal entries.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">As of</label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-44" />
          <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
          <Button size="sm" onClick={exportPdf}><FileText className="h-4 w-4 mr-1" /> Download PDF</Button>
        </div>
      </header>

      {loading ? (
        <Card className="card-glass p-12 text-center text-muted-foreground">Loading…</Card>
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
                suffix={
                  <div className="flex justify-between text-sm border-b border-border/30 py-1 italic text-muted-foreground">
                    <span>Retained Earnings (Profit & Loss to date)</span>
                    <span className="font-mono">{fmt(retained)}</span>
                  </div>
                }
              />
            </Card>
          </div>

          <Card className={`card-glass p-4 flex justify-between items-center ${balanced ? "" : "border-rose-500/40"}`}>
            <div>
              <div className="text-xs text-muted-foreground">Total Assets</div>
              <div className="text-2xl font-bold font-mono">{fmt(assets.subtotal)}</div>
            </div>
            <div className="text-center">
              {balanced ? <span className="text-emerald-700 font-semibold">✓ Balanced</span> : <span className="text-rose-700 font-semibold">Out of balance: {fmt(assets.subtotal - totalLE)}</span>}
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total Liabilities + Equity</div>
              <div className="text-2xl font-bold font-mono">{fmt(totalLE)}</div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
