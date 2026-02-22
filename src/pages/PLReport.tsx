import { useState, useMemo } from "react";
import { usePLMultiPeriod, KNOWN_LINES, type PLPeriodKey, type PLPeriodData } from "@/hooks/usePLData";
import { PLInlineCell } from "@/components/pl/PLInlineCell";
import { PLAddLineItem } from "@/components/pl/PLAddLineItem";
import { PLManualInputEditor } from "@/components/pl/PLManualInputEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const fmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, d: number) => d === 0 ? "—" : `${(n / d * 100).toFixed(1)}%`;

// Manual line items that can be inline-edited
const EDITABLE_LINES = new Set(KNOWN_LINES);

type LineType = "header" | "subheader" | "item" | "total" | "subtotal" | "ratio" | "blank" | "section" | "editable";

interface Line {
  label: string;
  getValue: (d: PLPeriodData) => number | string | undefined;
  type: LineType;
  indent?: number;
  manualKey?: string;
  bold?: boolean;
}

function buildLines(allUnknownNames: string[]): Line[] {
  const m = (key: string) => (d: PLPeriodData) => d.manual[key] || 0;
  const lines: Line[] = [];

  // ── Revenue ──
  lines.push({ label: "Revenue", type: "header", getValue: () => undefined });
  lines.push({ label: "Assembly", type: "subheader", indent: 1, getValue: () => undefined });
  lines.push({ label: "Gross Revenue", type: "item", indent: 2, getValue: (d) => d.assembly.grossRevenue });
  lines.push({ label: "Service Charge", type: "item", indent: 2, getValue: (d) => d.assembly.serviceChargeRevenue });
  lines.push({ label: "Discounts", type: "item", indent: 2, getValue: (d) => d.assembly.discounts });
  lines.push({ label: "Net Sales", type: "subtotal", indent: 2, getValue: (d) => d.assembly.netSales });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Caliente", type: "subheader", indent: 1, getValue: () => undefined });
  lines.push({ label: "Gross Revenue", type: "item", indent: 2, getValue: (d) => d.caliente.grossRevenue });
  lines.push({ label: "Service Charge", type: "item", indent: 2, getValue: (d) => d.caliente.serviceChargeRevenue });
  lines.push({ label: "Discounts", type: "item", indent: 2, getValue: (d) => d.caliente.discounts });
  lines.push({ label: "Net Sales", type: "subtotal", indent: 2, getValue: (d) => d.caliente.netSales });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Total Revenue", type: "total", getValue: (d) => d.totalRevenue, bold: true });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ── COGS ──
  lines.push({ label: "Cost of Goods Sold", type: "header", getValue: () => undefined });
  lines.push({ label: "Beverage Cost", type: "editable", indent: 1, getValue: m("Beverage Cost"), manualKey: "Beverage Cost" });
  lines.push({ label: "Food Cost", type: "editable", indent: 1, getValue: m("Food Cost"), manualKey: "Food Cost" });
  const totalCOGS = (d: PLPeriodData) => (d.manual["Beverage Cost"] || 0) + (d.manual["Food Cost"] || 0);
  lines.push({ label: "Total COGS", type: "total", indent: 1, getValue: (d) => totalCOGS(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  const grossProfit = (d: PLPeriodData) => d.totalRevenue + totalCOGS(d);
  lines.push({ label: "Gross Profit", type: "total", getValue: (d) => grossProfit(d), bold: true });
  lines.push({ label: "Gross Margin", type: "ratio", getValue: (d) => pct(grossProfit(d), d.totalRevenue) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ── Operating Expenses ──
  lines.push({ label: "Operating Expenses", type: "header", getValue: () => undefined });

  lines.push({ label: "Rent & Related", type: "section", indent: 1, getValue: () => undefined });
  for (const k of ["Base Rental", "Rental Share (-)", "Government Fees", "Management Fees"]) {
    lines.push({ label: k, type: "editable", indent: 2, getValue: m(k), manualKey: k });
  }
  const totalRent = (d: PLPeriodData) =>
  (d.manual["Base Rental"] || 0) + (d.manual["Rental Share (-)"] || 0) + (
  d.manual["Government Fees"] || 0) + (d.manual["Management Fees"] || 0);
  lines.push({ label: "Total Rent", type: "subtotal", indent: 2, getValue: (d) => totalRent(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Salaries", type: "section", indent: 1, getValue: () => undefined });
  lines.push({ label: "FTE Salary", type: "editable", indent: 2, getValue: m("FTE Salary"), manualKey: "FTE Salary" });
  lines.push({ label: "FTE MPF", type: "editable", indent: 2, getValue: m("FTE MPF"), manualKey: "FTE MPF" });
  const totalFTE = (d: PLPeriodData) => (d.manual["FTE Salary"] || 0) + (d.manual["FTE MPF"] || 0);
  lines.push({ label: "Total FTE", type: "subtotal", indent: 2, getValue: (d) => totalFTE(d) });
  lines.push({ label: "PTE Salary", type: "editable", indent: 2, getValue: m("PTE Salary"), manualKey: "PTE Salary" });
  lines.push({ label: "PTE MPF", type: "editable", indent: 2, getValue: m("PTE MPF"), manualKey: "PTE MPF" });
  const totalPTE = (d: PLPeriodData) => (d.manual["PTE Salary"] || 0) + (d.manual["PTE MPF"] || 0);
  lines.push({ label: "Total PTE", type: "subtotal", indent: 2, getValue: (d) => totalPTE(d) });
  const totalSalary = (d: PLPeriodData) => totalFTE(d) + totalPTE(d);
  lines.push({ label: "Total Salaries", type: "subtotal", indent: 2, getValue: (d) => totalSalary(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Utilities", type: "section", indent: 1, getValue: () => undefined });
  for (const k of ["Electricity", "Water", "HKT/PCCW"]) {
    lines.push({ label: k, type: "editable", indent: 2, getValue: m(k), manualKey: k });
  }
  const totalUtilities = (d: PLPeriodData) =>
  (d.manual["Electricity"] || 0) + (d.manual["Water"] || 0) + (d.manual["HKT/PCCW"] || 0);
  lines.push({ label: "Total Utilities", type: "subtotal", indent: 2, getValue: (d) => totalUtilities(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Other Operating Expenses", type: "section", indent: 1, getValue: () => undefined });
  for (const k of ["Card Processing Fees", "Office Administration Fees", "Other Expenses", "Miscellaneous Expenses"]) {
    lines.push({ label: k, type: "editable", indent: 2, getValue: m(k), manualKey: k });
  }
  for (const name of allUnknownNames) {
    lines.push({ label: name, type: "editable", indent: 2, getValue: (d) => {
        const found = d.unknownManualLines.find((u) => u.name === name);
        return found ? found.amount : 0;
      }, manualKey: name });
  }
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  const totalOpex = (d: PLPeriodData) => {
    const otherUnknown = d.unknownManualLines.reduce((s, l) => s + l.amount, 0);
    return totalCOGS(d) + totalRent(d) + totalSalary(d) + totalUtilities(d) + (
    d.manual["Card Processing Fees"] || 0) + (d.manual["Office Administration Fees"] || 0) + (
    d.manual["Other Expenses"] || 0) + (d.manual["Miscellaneous Expenses"] || 0) + otherUnknown;
  };
  lines.push({ label: "Total Operating Expenses", type: "total", getValue: (d) => totalOpex(d), bold: true });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  const ebitda = (d: PLPeriodData) => d.totalRevenue + totalOpex(d);
  const ebit_raw = (d: PLPeriodData) => ebitda(d) + (d.manual["Depreciation"] || 0) + (d.manual["Amortization"] || 0);

  lines.push({ label: "EBITDA", type: "total", getValue: (d) => ebitda(d), bold: true });
  lines.push({ label: "EBITDA Margin", type: "ratio", getValue: (d) => pct(ebitda(d), d.totalRevenue) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Depreciation & Amortization", type: "section", indent: 1, getValue: () => undefined });
  lines.push({ label: "Depreciation", type: "editable", indent: 2, getValue: m("Depreciation"), manualKey: "Depreciation" });
  lines.push({ label: "Amortization", type: "editable", indent: 2, getValue: m("Amortization"), manualKey: "Amortization" });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Operating Income (EBIT)", type: "total", getValue: (d) => ebit_raw(d), bold: true });
  lines.push({ label: "Net Operating Profit", type: "total", getValue: (d) => ebit_raw(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Key Ratios", type: "header", getValue: () => undefined });
  lines.push({ label: "COGS %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalCOGS(d)), d.totalRevenue) });
  lines.push({ label: "Labor Cost %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalSalary(d)), d.totalRevenue) });
  lines.push({ label: "Rent %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalRent(d)), d.totalRevenue) });

  return lines;
}

export default function PLReport() {
  const { isActionHidden } = usePagePermissions();
  const hideEditValues = isActionHidden("pl-report.edit_values");
  const hideAddLineItem = isActionHidden("pl-report.add_line_item");
  const [year, setYear] = useState(currentYear);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => {
    const m = new Date().getMonth() + 1;
    return [m];
  });

  const periods = useMemo<PLPeriodKey[]>(() =>
  [...selectedMonths].sort((a, b) => a - b).map((m) => ({ year, month: m })),
  [year, selectedMonths]);

  const { periodData, totals, loading, refetch } = usePLMultiPeriod(periods);

  const allUnknownNames = useMemo(() => {
    const names = new Set<string>();
    for (const pd of periodData) {
      for (const ul of pd.data.unknownManualLines) names.add(ul.name);
    }
    return [...names].sort();
  }, [periodData]);

  const lines = useMemo(() => buildLines(allUnknownNames), [allUnknownNames]);

  const showTotal = periods.length > 1;

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) =>
    prev.includes(m) ?
    prev.length > 1 ? prev.filter((x) => x !== m) : prev :
    [...prev, m]
    );
  };

  const selectAll = () => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i + 1));
  const selectQ = (q: number) => {
    const start = (q - 1) * 3 + 1;
    setSelectedMonths([start, start + 1, start + 2]);
  };

  const monthLabel = selectedMonths.length === 12 ?
  `All Months` :
  selectedMonths.length === 1 ?
  FULL_MONTHS[selectedMonths[0] - 1] :
  `${selectedMonths.length} months`;

  // Track a running row index for alternating colors on data rows
  let dataRowIndex = 0;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">P&L Report</span>
          <span className="text-muted-foreground ml-2 text-base font-normal">Caliente + Assembly</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Note: Prepared for internal management use only. This P&L is based on management reporting conventions and may not align with statutory financial statements or formal accounting policies.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              {monthLabel} <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="flex gap-1 mb-2 flex-wrap">
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={selectAll}>All</Button>
              {[1, 2, 3, 4].map((q) =>
              <Button key={q} variant="ghost" size="sm" className="text-xs h-6" onClick={() => selectQ(q)}>Q{q}</Button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MONTHS.map((m, i) =>
              <label key={i} className="flex items-center gap-1.5 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-accent/30">
                  <Checkbox
                  checked={selectedMonths.includes(i + 1)}
                  onCheckedChange={() => toggleMonth(i + 1)}
                  className="h-3.5 w-3.5" />
                  {m}
                </label>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {!hideEditValues && (
          <div className="ml-auto">
            <PLManualInputEditor onSave={refetch} />
          </div>
        )}
      </div>

      {/* P&L Table */}
      {loading ?
      <p className="text-muted-foreground">Loading…</p> :

      <div className="pl-table rounded-xl border border-[hsl(var(--pl-border))] overflow-x-auto relative" style={{ boxShadow: '0 2px 16px -4px hsl(25 20% 15% / 0.07)' }}>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest sticky left-0 z-20 min-w-[230px] border-b-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(30, 18%, 86%)' }}>
                  P&L
                </th>
                {periodData.map((pd) =>
              <th key={pd.label} className="text-right px-4 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest whitespace-nowrap min-w-[120px] border-b-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(30, 18%, 86%)' }}>
                    {pd.label}
                  </th>
              )}
                {showTotal &&
              <th className="text-right px-4 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest whitespace-nowrap min-w-[120px] border-b-2 border-l-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(28, 22%, 83%)' }}>
                    Total
                  </th>
              }
              </tr>
            </thead>
            <tbody>
              {(() => {
                let rowIdx = 0;
                return lines.map((line, i) => {
                if (line.type === "blank") return <tr key={i}><td colSpan={99} className="h-px" style={{ background: 'hsl(30, 12%, 90%)' }} /></tr>;

                const indent = (line.indent || 0) * 20;
                const isHeader = line.type === "header";
                const isSection = line.type === "section" || line.type === "subheader";
                const isTotal = line.type === "total" || line.type === "subtotal";
                const isRatio = line.type === "ratio";
                const isEditable = line.type === "editable";
                const isItem = line.type === "item";
                const isDataRow = isEditable || isItem;

                // Determine background using inline style for consistency
                let rowBg: string;
                if (isHeader) {
                  rowBg = "hsl(30, 18%, 86%)";
                } else if (isTotal && line.bold) {
                  rowBg = "hsl(24, 28%, 84%)";
                } else if (isTotal) {
                  rowBg = "hsl(28, 22%, 89%)";
                } else if (isSection) {
                  rowBg = "hsl(30, 15%, 91%)";
                } else if (isRatio) {
                  rowBg = "hsl(35, 18%, 95%)";
                } else {
                  // Alternating rows for data
                  rowBg = rowIdx % 2 === 0 ? "hsl(33, 22%, 95%)" : "hsl(35, 28%, 97.5%)";
                  rowIdx++;
                }

                // Border treatment
                const borderStyle = isHeader
                  ? { borderBottom: '1px solid hsl(30, 12%, 82%)' }
                  : (isTotal && line.bold)
                  ? { borderTop: '2px solid hsl(24, 20%, 78%)', borderBottom: '1px solid hsl(30, 12%, 85%)' }
                  : isTotal
                  ? { borderTop: '1px solid hsl(30, 12%, 85%)', borderBottom: '1px solid hsl(30, 12%, 88%)' }
                  : {};

                // Label styling
                const labelClass = isHeader
                  ? "font-bold text-foreground text-[11px] uppercase tracking-widest"
                  : isTotal && line.bold
                  ? "font-bold text-foreground"
                  : isTotal
                  ? "font-semibold text-foreground/90"
                  : isSection
                  ? "font-semibold text-primary/80 text-[11px] uppercase tracking-wide"
                  : isRatio
                  ? "italic text-muted-foreground text-xs"
                  : "text-foreground/75";

                // Value cell styling
                const valueCellClass = (isNeg: boolean) =>
                  `px-4 py-[7px] text-right font-mono tabular-nums text-[13px] ${
                    isNeg ? "text-destructive" : isRatio ? "text-muted-foreground" : "text-foreground/75"
                  } ${isTotal && line.bold ? "font-bold" : isTotal ? "font-semibold" : ""}`;

                return (
                  <tr key={i} style={{ background: rowBg, ...borderStyle }}>
                      <td
                      className={`px-5 py-[7px] sticky left-0 z-10 ${labelClass}`}
                      style={{ paddingLeft: 20 + indent, background: rowBg }}>
                        {line.label}
                      </td>
                      {periodData.map((pd) => {
                      const val = line.getValue(pd.data);
                      if (isEditable && line.manualKey && !hideEditValues) {
                        return (
                          <td key={pd.label} className="px-3 py-0.5 text-right">
                              <PLInlineCell
                              lineItemName={line.manualKey}
                              year={pd.key.year}
                              month={pd.key.month}
                              currentValue={typeof val === "number" ? val : 0}
                              onSaved={refetch} />
                            </td>);
                      }
                      const isNeg = typeof val === "number" && val < 0;
                      return (
                        <td key={pd.label} className={valueCellClass(isNeg)}>
                            {val === undefined ? "" : typeof val === "number" ? fmt(val) : val}
                          </td>);
                    })}
                      {showTotal && (() => {
                      const val = line.getValue(totals);
                      const isNeg = typeof val === "number" && val < 0;
                      if (isEditable) {
                        return (
                          <td className="px-4 py-[7px] text-right font-mono tabular-nums text-[13px] font-medium text-foreground/75" style={{ borderLeft: '2px solid hsl(30, 12%, 82%)' }}>
                              {typeof val === "number" ? fmt(val) : val ?? ""}
                            </td>);
                      }
                      return (
                        <td className={`${valueCellClass(isNeg)}`} style={{ borderLeft: '2px solid hsl(30, 12%, 82%)' }}>
                            {val === undefined ? "" : typeof val === "number" ? fmt(val) : val}
                          </td>);
                    })()}
                    </tr>);
              });
            })()}
            </tbody>
          </table>

          {!hideAddLineItem && (
            <div style={{ borderTop: '2px solid hsl(30, 12%, 82%)' }}>
              <PLAddLineItem year={year} months={selectedMonths} onAdded={refetch} />
            </div>
          )}
        </div>
      }
    </div>);
}
