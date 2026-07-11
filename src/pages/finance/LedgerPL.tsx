import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileDown, BookText } from "lucide-react";
import {
  PLPeriodSelector,
  getDefaultPeriod,
  getOptionsForView,
  type ViewMode,
  type PeriodOption,
} from "@/components/pl/PLPeriodSelector";
import { useLedgerPL } from "@/hooks/useLedgerPL";
import type { ChartAccount, AccountType } from "@/hooks/useChartOfAccounts";
import { downloadCSV } from "@/utils/csvDownload";
import { generateLedgerPLPDF, type LedgerPLRow } from "@/utils/financePdfReports";
import {
  PageHeader,
  KpiCard,
  KpiGrid,
  KpiSkeleton,
  TableSkeleton,
  EmptyState,
  fmtHKWhole,
} from "@/components/expenses/shared";
import { cn } from "@/lib/utils";

const fmt = (n: number) => {
  if (n === 0) return "—";
  const abs = Math.abs(n).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};

const SECTION_ORDER: { type: AccountType; label: string }[] = [
  { type: "revenue", label: "Revenue" },
  { type: "cogs", label: "Cost of Goods Sold" },
  { type: "opex", label: "Operating Expenses" },
  { type: "other_income", label: "Other Income" },
  { type: "other_expense", label: "Other Expenses" },
];

interface TreeNode {
  account: ChartAccount;
  children: TreeNode[];
}

function buildTree(accounts: ChartAccount[], type: AccountType): TreeNode[] {
  const filtered = accounts.filter(a => a.account_type === type && a.is_active);
  const byParent = new Map<string | null, ChartAccount[]>();
  for (const a of filtered) {
    const p = a.parent_id || null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(a);
  }
  // ensure children whose parent is outside this type are treated as roots
  const validIds = new Set(filtered.map(a => a.id));
  const build = (parentId: string | null): TreeNode[] => {
    const list = (byParent.get(parentId) || []).sort((a, b) =>
      (a.sort_order - b.sort_order) || a.code.localeCompare(b.code)
    );
    return list.map(account => ({ account, children: build(account.id) }));
  };
  const roots: TreeNode[] = [];
  for (const a of filtered) {
    if (!a.parent_id || !validIds.has(a.parent_id)) {
      // root
    }
  }
  // Include accounts whose parent is null OR parent isn't in this section
  const included = new Set<string>();
  const collect = (parentId: string | null): TreeNode[] => {
    const direct = (byParent.get(parentId) || []).sort((a, b) =>
      (a.sort_order - b.sort_order) || a.code.localeCompare(b.code)
    );
    return direct.map(account => {
      included.add(account.id);
      return { account, children: collect(account.id) };
    });
  };
  // start with null-parent accounts
  for (const node of collect(null)) roots.push(node);
  // accounts whose parent is not in this section -> add as roots too
  for (const a of filtered) {
    if (included.has(a.id)) continue;
    if (a.parent_id && !validIds.has(a.parent_id)) {
      included.add(a.id);
      roots.push({ account: a, children: collect(a.id) });
    }
  }
  return roots;
}

function parsePeriodIds(view: ViewMode, csv: string | null): PeriodOption[] | null {
  if (!csv) return null;
  const ids = csv.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  const yearsInIds = Array.from(new Set(ids.map((id) => Number(id.split("-")[0])).filter((y) => y >= 2000 && y <= 2100)));
  const catalog = new Map<string, PeriodOption>();
  for (const y of yearsInIds) {
    for (const opt of getOptionsForView(view, y)) catalog.set(opt.id, opt);
  }
  const resolved = ids.map((id) => catalog.get(id)).filter(Boolean) as PeriodOption[];
  return resolved.length > 0 ? resolved : null;
}

export default function LedgerPL() {
  const [params, setParams] = useSearchParams();
  const viewMode = (params.get("view") as ViewMode) || "monthly";
  const perVenue = params.get("perVenue") === "1";
  const [selectedPeriods, setSelectedPeriodsState] = useState<PeriodOption[]>(
    () => parsePeriodIds(viewMode, params.get("periods")) || getDefaultPeriod(viewMode),
  );

  const updateParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === "") next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };
  const setViewMode = (v: ViewMode) => {
    const defaults = getDefaultPeriod(v);
    setSelectedPeriodsState(defaults);
    const next = new URLSearchParams(params);
    next.set("view", v);
    next.set("periods", defaults.map((p) => p.id).join(","));
    setParams(next, { replace: true });
  };
  const setSelectedPeriods = (periods: PeriodOption[]) => {
    setSelectedPeriodsState(periods);
    updateParam("periods", periods.map((p) => p.id).join(","));
  };
  const setPerVenue = (v: boolean) => updateParam("perVenue", v ? "1" : null);

  // Keep URL in sync on first mount when it lacks periods param (so refresh restores state).
  useEffect(() => {
    if (!params.get("periods") && selectedPeriods.length > 0) {
      const next = new URLSearchParams(params);
      next.set("periods", selectedPeriods.map((p) => p.id).join(","));
      if (!params.get("view")) next.set("view", viewMode);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { accounts, data, venues, loading } = useLedgerPL(selectedPeriods);


  const trees = useMemo(() => {
    const m = new Map<AccountType, TreeNode[]>();
    for (const s of SECTION_ORDER) m.set(s.type, buildTree(accounts, s.type));
    return m;
  }, [accounts]);

  // Get amount for a given account in a period, summed across descendants.
  const getAmount = (acct: ChartAccount, periodId: string, venue: string | null): number => {
    const periodMap = data.get(periodId);
    if (!periodMap) return 0;
    // Sum self + all descendant accounts
    const ids = new Set<string>();
    const collect = (id: string) => {
      ids.add(id);
      for (const a of accounts) if (a.parent_id === id) collect(a.id);
    };
    collect(acct.id);
    let total = 0;
    for (const id of ids) {
      const acctMap = periodMap.get(id);
      if (!acctMap) continue;
      total += acctMap.get(venue || "__total__") || 0;
    }
    return total;
  };

  const sectionTotal = (type: AccountType, periodId: string, venue: string | null): number => {
    const periodMap = data.get(periodId);
    if (!periodMap) return 0;
    let total = 0;
    for (const a of accounts) {
      if (a.account_type !== type) continue;
      const acctMap = periodMap.get(a.id);
      if (!acctMap) continue;
      total += acctMap.get(venue || "__total__") || 0;
    }
    return total;
  };

  // Columns: each period × (consolidated OR each venue), plus Total column at end
  const columns = useMemo(() => {
    const cols: { key: string; label: string; periodId: string; venue: string | null }[] = [];
    for (const p of selectedPeriods) {
      if (perVenue && venues.length > 0) {
        for (const v of venues) cols.push({ key: `${p.id}|${v}`, label: `${p.label} · ${v}`, periodId: p.id, venue: v });
        cols.push({ key: `${p.id}|__total__`, label: `${p.label} · Total`, periodId: p.id, venue: null });
      } else {
        cols.push({ key: p.id, label: p.label, periodId: p.id, venue: null });
      }
    }
    return cols;
  }, [selectedPeriods, perVenue, venues]);

  const showGrandTotal = selectedPeriods.length > 1;

  const computeRow = (getter: (periodId: string, venue: string | null) => number) => {
    const cells = columns.map(c => getter(c.periodId, c.venue));
    const totalAcrossPeriods = selectedPeriods.reduce((s, p) => s + getter(p.id, null), 0);
    return { cells, totalAcrossPeriods };
  };

  const renderTree = (nodes: TreeNode[], depth: number): JSX.Element[] => {
    return nodes.flatMap(node => {
      const row = computeRow((pid, v) => getAmount(node.account, pid, v));
      const hasAny = row.cells.some(c => c !== 0) || row.totalAcrossPeriods !== 0;
      if (!hasAny && node.children.length === 0) return [];
      const isParent = node.children.length > 0;
      return [
        <tr key={node.account.id} className={isParent ? "bg-muted/20 font-medium" : ""}>
          <td className="py-1.5 px-3 text-sm" style={{ paddingLeft: `${12 + depth * 18}px` }}>
            <span className="font-mono text-xs text-muted-foreground mr-2">{node.account.code}</span>
            {node.account.name}
          </td>
          {row.cells.map((v, i) => (
            <td key={i} className={cn("py-1.5 px-3 text-right text-sm tabular-nums", v < 0 && "text-destructive")}>{fmt(v)}</td>
          ))}
          {showGrandTotal && (
            <td className={cn("py-1.5 px-3 text-right text-sm tabular-nums border-l border-border/60 font-medium", row.totalAcrossPeriods < 0 && "text-destructive")}>
              {fmt(row.totalAcrossPeriods)}
            </td>
          )}
        </tr>,
        ...renderTree(node.children, depth + 1),
      ];
    });
  };


  // Section subtotals
  const subtotal = (type: AccountType) => computeRow((pid, v) => sectionTotal(type, pid, v));

  const grossProfit = (pid: string, v: string | null) =>
    sectionTotal("revenue", pid, v) - sectionTotal("cogs", pid, v);
  const operatingProfit = (pid: string, v: string | null) =>
    grossProfit(pid, v) - sectionTotal("opex", pid, v);
  const netIncome = (pid: string, v: string | null) =>
    operatingProfit(pid, v) + sectionTotal("other_income", pid, v) - sectionTotal("other_expense", pid, v);

  const exportCsv = () => {
    const rows: any[] = [];
    const push = (label: string, getter: (pid: string, v: string | null) => number) => {
      const r: any = { label };
      let tot = 0;
      for (const c of columns) {
        const val = getter(c.periodId, c.venue);
        r[c.label] = val.toFixed(2);
      }
      for (const p of selectedPeriods) tot += getter(p.id, null);
      if (showGrandTotal) r["TOTAL"] = tot.toFixed(2);
      rows.push(r);
    };

    for (const sec of SECTION_ORDER) {
      const tree = trees.get(sec.type) || [];
      if (tree.length === 0) continue;
      rows.push({ label: `— ${sec.label} —` });
      const walk = (nodes: TreeNode[], depth: number) => {
        for (const n of nodes) {
          push(`${"  ".repeat(depth)}${n.account.code} ${n.account.name}`,
            (pid, v) => getAmount(n.account, pid, v));
          walk(n.children, depth + 1);
        }
      };
      walk(tree, 1);
      push(`Total ${sec.label}`, (pid, v) => sectionTotal(sec.type, pid, v));
    }
    push("Gross Profit", grossProfit);
    push("Operating Profit", operatingProfit);
    push("Net Income", netIncome);

    const cols = [{ key: "label", label: "Account" }, ...columns.map(c => ({ key: c.label, label: c.label }))];
    if (showGrandTotal) cols.push({ key: "TOTAL", label: "TOTAL" });
    downloadCSV(rows, cols, "ledger_pl");
  };

  const exportPdf = () => {
    const pdfRows: LedgerPLRow[] = [];
    const periodCols = columns.map((c) => ({ key: c.key, label: c.label }));

    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        const cells = columns.map((c) => getAmount(n.account, c.periodId, c.venue));
        const total = selectedPeriods.reduce((s, p) => s + getAmount(n.account, p.id, null), 0);
        if (cells.every((v) => v === 0) && total === 0 && n.children.length === 0) continue;
        pdfRows.push({
          label: n.account.name,
          code: n.account.code,
          depth,
          cells,
          total,
        });
        walk(n.children, depth + 1);
      }
    };

    for (const sec of SECTION_ORDER) {
      const tree = trees.get(sec.type) || [];
      if (tree.length === 0) continue;
      pdfRows.push({ label: sec.label, depth: 0, isSection: true, cells: [] });
      walk(tree, 1);
      const sub = subtotal(sec.type);
      pdfRows.push({
        label: `Total ${sec.label}`,
        depth: 0,
        isSubtotal: true,
        cells: sub.cells,
        total: sub.totalAcrossPeriods,
      });
    }

    const compRow = (fn: (pid: string, v: string | null) => number, label: string, isFinal = false) => {
      const r = computeRow(fn);
      pdfRows.push({
        label,
        depth: 0,
        isComputed: !isFinal,
        isFinal,
        cells: r.cells,
        total: r.totalAcrossPeriods,
      });
    };
    compRow(grossProfit, "Gross Profit");
    compRow(operatingProfit, "Operating Profit");
    compRow(netIncome, "Net Income", true);

    const periodLabel = selectedPeriods.map((p) => p.label).join(", ");
    generateLedgerPLPDF({
      periodLabel,
      columns: periodCols,
      rows: pdfRows,
      showGrandTotal,
    });
  };

  const scopeLabel = selectedPeriods.length === 0 ? "No period selected" : selectedPeriods.map((p) => p.label).join(", ");

  // Headline totals summed across all selected periods (consolidated, no venue split)
  const totalRevenue = selectedPeriods.reduce((s, p) => s + sectionTotal("revenue", p.id, null), 0);
  const totalCOGS = selectedPeriods.reduce((s, p) => s + sectionTotal("cogs", p.id, null), 0);
  const totalOpex = selectedPeriods.reduce((s, p) => s + sectionTotal("opex", p.id, null), 0);
  const totalOtherInc = selectedPeriods.reduce((s, p) => s + sectionTotal("other_income", p.id, null), 0);
  const totalOtherExp = selectedPeriods.reduce((s, p) => s + sectionTotal("other_expense", p.id, null), 0);
  const totalGross = totalRevenue - totalCOGS;
  const totalOperating = totalGross - totalOpex;
  const totalNet = totalOperating + totalOtherInc - totalOtherExp;
  const netMargin = totalRevenue !== 0 ? (totalNet / totalRevenue) * 100 : null;

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <PageHeader
        title="Profit & Loss (Ledger)"
        description="Built directly from posted journal entries against the Chart of Accounts. Independent from the operations P&L."
        actions={
          <>
            <PLPeriodSelector
              viewMode={viewMode}
              selectedPeriods={selectedPeriods}
              onViewModeChange={setViewMode}
              onPeriodsChange={setSelectedPeriods}
            />
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card">
              <Switch id="per-venue" checked={perVenue} onCheckedChange={setPerVenue} />
              <Label htmlFor="per-venue" className="text-xs cursor-pointer">Per venue</Label>
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
            <Button size="sm" onClick={exportPdf}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          </>
        }
      />

      <p className="text-xs text-muted-foreground -mt-2">{scopeLabel}</p>

      {loading ? (
        <KpiSkeleton count={4} />
      ) : selectedPeriods.length > 0 && (
        <KpiGrid>
          <KpiCard label="Revenue" value={fmtHKWhole(totalRevenue)} tone="info" />
          <KpiCard label="Gross Profit" value={fmtHKWhole(totalGross)} tone={totalGross >= 0 ? "success" : "destructive"} hint={totalRevenue !== 0 ? `${((totalGross / totalRevenue) * 100).toFixed(1)}% margin` : undefined} />
          <KpiCard label="Operating Profit" value={fmtHKWhole(totalOperating)} tone={totalOperating >= 0 ? "success" : "destructive"} hint={totalRevenue !== 0 ? `${((totalOperating / totalRevenue) * 100).toFixed(1)}% margin` : undefined} />
          <KpiCard label="Net Income" value={fmtHKWhole(totalNet)} tone={totalNet >= 0 ? "success" : "destructive"} hint={netMargin !== null ? `${netMargin.toFixed(1)}% net margin` : undefined} />
        </KpiGrid>
      )}



      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={10} cols={Math.max(2, columns.length + 1 + (showGrandTotal ? 1 : 0))} />
        ) : selectedPeriods.length === 0 ? (
          <EmptyState
            icon={<BookText className="h-6 w-6" />}
            title="Select at least one period"
            description="Choose a period from the selector to build the P&L from posted journal entries."
          />
        ) : (

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Account</th>
                  {columns.map(c => (
                    <th key={c.key} className="text-right py-2 px-3 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  {showGrandTotal && (
                    <th className="text-right py-2 px-3 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground border-l border-border/60 whitespace-nowrap">
                      TOTAL
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {SECTION_ORDER.map(sec => {
                  const tree = trees.get(sec.type) || [];
                  if (tree.length === 0) return null;
                  const rows = renderTree(tree, 0);
                  if (rows.length === 0) return null;
                  const sub = subtotal(sec.type);
                  return (
                    <React.Fragment key={sec.type}>
                      <tr className="border-y border-border">
                        <td colSpan={columns.length + 1 + (showGrandTotal ? 1 : 0)}
                            className="py-2 px-3 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground bg-muted/30">
                          {sec.label}
                        </td>
                      </tr>
                      {rows}
                      <tr className="bg-muted/40 font-semibold border-t border-border">
                        <td className="py-2 px-3 text-sm">Total {sec.label}</td>
                        {sub.cells.map((v, i) => (
                          <td key={i} className={cn("py-2 px-3 text-right text-sm tabular-nums", v < 0 && "text-destructive")}>{fmt(v)}</td>
                        ))}
                        {showGrandTotal && (
                          <td className={cn("py-2 px-3 text-right text-sm tabular-nums border-l border-border/60", sub.totalAcrossPeriods < 0 && "text-destructive")}>
                            {fmt(sub.totalAcrossPeriods)}
                          </td>
                        )}
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Computed totals with margin % suffix */}
                {(["Gross Profit", "Operating Profit", "Net Income"] as const).map((label, idx) => {
                  const fn = idx === 0 ? grossProfit : idx === 1 ? operatingProfit : netIncome;
                  const row = computeRow(fn);
                  const revenueRow = computeRow((pid, v) => sectionTotal("revenue", pid, v));
                  const isFinal = label === "Net Income";
                  const marginTotal = revenueRow.totalAcrossPeriods !== 0
                    ? (row.totalAcrossPeriods / revenueRow.totalAcrossPeriods * 100)
                    : null;
                  return (
                    <tr key={label} className={isFinal
                      ? "bg-primary/10 border-t-2 border-double border-foreground/40 font-bold"
                      : "bg-muted/30 border-t border-border font-semibold"}>
                      <td className="py-2.5 px-3 text-sm uppercase tracking-wide">
                        {label}
                        {marginTotal !== null && (
                          <span className="ml-2 text-[11px] normal-case tracking-normal text-muted-foreground font-normal">
                            · {marginTotal.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      {row.cells.map((v, i) => {
                        const revCell = revenueRow.cells[i] || 0;
                        const margin = revCell !== 0 ? (v / revCell * 100) : null;
                        return (
                          <td key={i} className={cn("py-2.5 px-3 text-right text-sm tabular-nums", v < 0 && "text-destructive")}>
                            <div>{fmt(v)}</div>
                            {margin !== null && (
                              <div className="text-[10px] text-muted-foreground font-normal">{margin.toFixed(1)}%</div>
                            )}
                          </td>
                        );
                      })}
                      {showGrandTotal && (
                        <td className={cn("py-2.5 px-3 text-right text-sm tabular-nums border-l border-border/60", row.totalAcrossPeriods < 0 && "text-destructive")}>
                          <div>{fmt(row.totalAcrossPeriods)}</div>
                          {marginTotal !== null && (
                            <div className="text-[10px] text-muted-foreground font-normal">{marginTotal.toFixed(1)}%</div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

}
