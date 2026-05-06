import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileDown } from "lucide-react";
import { PLPeriodSelector, getDefaultPeriod, type ViewMode, type PeriodOption } from "@/components/pl/PLPeriodSelector";
import { useLedgerPL } from "@/hooks/useLedgerPL";
import type { ChartAccount, AccountType } from "@/hooks/useChartOfAccounts";
import { downloadCSV } from "@/utils/csvDownload";

const fmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export default function LedgerPL() {
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedPeriods, setSelectedPeriods] = useState<PeriodOption[]>(() => getDefaultPeriod("monthly"));
  const [perVenue, setPerVenue] = useState(false);

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
            <td key={i} className="py-1.5 px-3 text-right font-mono text-sm tabular-nums">{fmt(v)}</td>
          ))}
          {showGrandTotal && (
            <td className="py-1.5 px-3 text-right font-mono text-sm tabular-nums border-l border-border/60 font-medium">
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

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profit & Loss (Ledger)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Built directly from posted journal entries against the Chart of Accounts. Independent from the operations P&L.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PLPeriodSelector
            viewMode={viewMode}
            selectedPeriods={selectedPeriods}
            onViewModeChange={setViewMode}
            onPeriodsChange={setSelectedPeriods}
          />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card">
            <Switch id="per-venue" checked={perVenue} onCheckedChange={setPerVenue} />
            <Label htmlFor="per-venue" className="text-xs cursor-pointer">Per venue</Label>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileDown className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </header>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : selectedPeriods.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">Select at least one period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Account</th>
                  {columns.map(c => (
                    <th key={c.key} className="text-right py-2 px-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  {showGrandTotal && (
                    <th className="text-right py-2 px-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground border-l border-border/60 whitespace-nowrap">
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
                    <>
                      <tr key={`h-${sec.type}`} className="bg-primary/5 border-y border-border">
                        <td colSpan={columns.length + 1 + (showGrandTotal ? 1 : 0)}
                            className="py-2 px-3 text-xs uppercase tracking-wider font-bold text-primary">
                          {sec.label}
                        </td>
                      </tr>
                      {rows}
                      <tr key={`s-${sec.type}`} className="bg-muted/40 font-semibold border-t border-border">
                        <td className="py-2 px-3 text-sm">Total {sec.label}</td>
                        {sub.cells.map((v, i) => (
                          <td key={i} className="py-2 px-3 text-right font-mono text-sm tabular-nums">{fmt(v)}</td>
                        ))}
                        {showGrandTotal && (
                          <td className="py-2 px-3 text-right font-mono text-sm tabular-nums border-l border-border/60">
                            {fmt(sub.totalAcrossPeriods)}
                          </td>
                        )}
                      </tr>
                    </>
                  );
                })}

                {/* Computed totals */}
                {(["Gross Profit", "Operating Profit", "Net Income"] as const).map((label, idx) => {
                  const fn = idx === 0 ? grossProfit : idx === 1 ? operatingProfit : netIncome;
                  const row = computeRow(fn);
                  const isFinal = label === "Net Income";
                  return (
                    <tr key={label} className={isFinal
                      ? "bg-primary/10 border-t-2 border-double border-foreground/40 font-bold"
                      : "bg-muted/30 border-t border-border font-semibold"}>
                      <td className="py-2.5 px-3 text-sm uppercase tracking-wider">{label}</td>
                      {row.cells.map((v, i) => (
                        <td key={i} className={`py-2.5 px-3 text-right font-mono text-sm tabular-nums ${v < 0 ? "text-rose-700" : ""}`}>
                          {fmt(v)}
                        </td>
                      ))}
                      {showGrandTotal && (
                        <td className={`py-2.5 px-3 text-right font-mono text-sm tabular-nums border-l border-border/60 ${row.totalAcrossPeriods < 0 ? "text-rose-700" : ""}`}>
                          {fmt(row.totalAcrossPeriods)}
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
