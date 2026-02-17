import { useState, useMemo } from "react";
import { usePLMultiPeriod, KNOWN_LINES, type PLPeriodKey, type PLPeriodData } from "@/hooks/usePLData";
import { PLInlineCell } from "@/components/pl/PLInlineCell";
import { PLAddLineItem } from "@/components/pl/PLAddLineItem";
import { PLManualInputEditor } from "@/components/pl/PLManualInputEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, FileText, CalendarDays } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const fmt = (n: number) =>
  n === 0
    ? "—"
    : n < 0
    ? `(${Math.abs(n).toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })})`
    : n.toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const pct = (n: number, d: number) =>
  d === 0 ? "—" : `${(Math.abs(n) / d * 100).toFixed(1)}%`;

const EDITABLE_LINES = new Set(KNOWN_LINES);

type LineType = "header" | "subheader" | "item" | "total" | "subtotal" | "ratio" | "blank" | "section" | "editable" | "divider";

interface Line {
  label: string;
  getValue: (d: PLPeriodData) => number | string | undefined;
  type: LineType;
  indent?: number;
  manualKey?: string;
  bold?: boolean;
  highlight?: boolean; // for key totals like EBITDA, Net Profit
}

function buildLines(allUnknownNames: string[]): Line[] {
  const m = (key: string) => (d: PLPeriodData) => d.manual[key] || 0;
  const lines: Line[] = [];

  // ═══════════════════════════════════════════════
  // REVENUE
  // ═══════════════════════════════════════════════
  lines.push({ label: "Revenue", type: "header", getValue: () => undefined });

  lines.push({ label: "Assembly", type: "subheader", indent: 1, getValue: () => undefined });
  lines.push({ label: "Gross Sales", type: "item", indent: 2, getValue: (d) => d.assembly.grossRevenue });
  lines.push({ label: "Service Charge Income", type: "item", indent: 2, getValue: (d) => d.assembly.serviceChargeRevenue });
  lines.push({ label: "Less: Discounts & Allowances", type: "item", indent: 2, getValue: (d) => d.assembly.discounts });
  lines.push({ label: "Net Revenue", type: "subtotal", indent: 2, getValue: (d) => d.assembly.netSales });

  lines.push({ label: "", type: "blank", getValue: () => undefined });

  lines.push({ label: "Caliente", type: "subheader", indent: 1, getValue: () => undefined });
  lines.push({ label: "Gross Sales", type: "item", indent: 2, getValue: (d) => d.caliente.grossRevenue });
  lines.push({ label: "Service Charge Income", type: "item", indent: 2, getValue: (d) => d.caliente.serviceChargeRevenue });
  lines.push({ label: "Less: Discounts & Allowances", type: "item", indent: 2, getValue: (d) => d.caliente.discounts });
  lines.push({ label: "Net Revenue", type: "subtotal", indent: 2, getValue: (d) => d.caliente.netSales });

  lines.push({ label: "", type: "divider", getValue: () => undefined });
  lines.push({ label: "Total Net Revenue", type: "total", getValue: (d) => d.totalRevenue, bold: true, highlight: true });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // COST OF SALES
  // ═══════════════════════════════════════════════
  lines.push({ label: "Cost of Sales", type: "header", getValue: () => undefined });
  lines.push({ label: "Beverage Costs", type: "editable", indent: 1, getValue: m("Beverage Cost"), manualKey: "Beverage Cost" });
  lines.push({ label: "Food Costs", type: "editable", indent: 1, getValue: m("Food Cost"), manualKey: "Food Cost" });
  const totalCOGS = (d: PLPeriodData) => (d.manual["Beverage Cost"] || 0) + (d.manual["Food Cost"] || 0);
  lines.push({ label: "", type: "divider", getValue: () => undefined });
  lines.push({ label: "Total Cost of Sales", type: "total", indent: 0, getValue: (d) => totalCOGS(d), bold: true });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // GROSS PROFIT
  // ═══════════════════════════════════════════════
  const grossProfit = (d: PLPeriodData) => d.totalRevenue + totalCOGS(d);
  lines.push({ label: "Gross Profit", type: "total", getValue: (d) => grossProfit(d), bold: true, highlight: true });
  lines.push({ label: "GP Margin", type: "ratio", getValue: (d) => pct(grossProfit(d), d.totalRevenue) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // OPERATING EXPENSES
  // ═══════════════════════════════════════════════
  lines.push({ label: "Operating Expenses", type: "header", getValue: () => undefined });

  // Occupancy Costs
  lines.push({ label: "Occupancy Costs", type: "section", indent: 1, getValue: () => undefined });
  for (const k of ["Base Rental", "Rental Share (-)", "Government Fees", "Management Fees"]) {
    lines.push({ label: k === "Rental Share (-)" ? "Turnover Rent" : k, type: "editable", indent: 2, getValue: m(k), manualKey: k });
  }
  const totalRent = (d: PLPeriodData) =>
    (d.manual["Base Rental"] || 0) + (d.manual["Rental Share (-)"] || 0) +
    (d.manual["Government Fees"] || 0) + (d.manual["Management Fees"] || 0);
  lines.push({ label: "Subtotal Occupancy", type: "subtotal", indent: 1, getValue: (d) => totalRent(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // Payroll & Staff Costs
  lines.push({ label: "Payroll & Staff Costs", type: "section", indent: 1, getValue: () => undefined });
  lines.push({ label: "Full-Time Wages", type: "editable", indent: 2, getValue: m("FTE Salary"), manualKey: "FTE Salary" });
  lines.push({ label: "Full-Time MPF", type: "editable", indent: 2, getValue: m("FTE MPF"), manualKey: "FTE MPF" });
  const totalFTE = (d: PLPeriodData) => (d.manual["FTE Salary"] || 0) + (d.manual["FTE MPF"] || 0);
  lines.push({ label: "Part-Time Wages", type: "editable", indent: 2, getValue: m("PTE Salary"), manualKey: "PTE Salary" });
  lines.push({ label: "Part-Time MPF", type: "editable", indent: 2, getValue: m("PTE MPF"), manualKey: "PTE MPF" });
  const totalPTE = (d: PLPeriodData) => (d.manual["PTE Salary"] || 0) + (d.manual["PTE MPF"] || 0);
  const totalSalary = (d: PLPeriodData) => totalFTE(d) + totalPTE(d);
  lines.push({ label: "Subtotal Payroll", type: "subtotal", indent: 1, getValue: (d) => totalSalary(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // Utilities & Telecoms
  lines.push({ label: "Utilities & Telecoms", type: "section", indent: 1, getValue: () => undefined });
  for (const k of ["Electricity", "Water", "HKT/PCCW"]) {
    lines.push({ label: k === "HKT/PCCW" ? "Telecoms (HKT)" : k, type: "editable", indent: 2, getValue: m(k), manualKey: k });
  }
  const totalUtilities = (d: PLPeriodData) =>
    (d.manual["Electricity"] || 0) + (d.manual["Water"] || 0) + (d.manual["HKT/PCCW"] || 0);
  lines.push({ label: "Subtotal Utilities", type: "subtotal", indent: 1, getValue: (d) => totalUtilities(d) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // General & Administrative
  lines.push({ label: "General & Administrative", type: "section", indent: 1, getValue: () => undefined });
  const gaMap: Record<string, string> = {
    "Card Processing Fees": "Payment Processing",
    "Office Administration Fees": "Office & Admin",
    "Other Expenses": "Other Expenses",
    "Miscellaneous Expenses": "Sundry Expenses",
  };
  for (const [k, label] of Object.entries(gaMap)) {
    lines.push({ label, type: "editable", indent: 2, getValue: m(k), manualKey: k });
  }
  // Unknown / dynamic lines
  for (const name of allUnknownNames) {
    lines.push({
      label: name, type: "editable", indent: 2,
      getValue: (d) => {
        const found = d.unknownManualLines.find((u) => u.name === name);
        return found ? found.amount : 0;
      },
      manualKey: name,
    });
  }
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // Total OpEx
  const totalOpex = (d: PLPeriodData) => {
    const otherUnknown = d.unknownManualLines.reduce((s, l) => s + l.amount, 0);
    return totalCOGS(d) + totalRent(d) + totalSalary(d) + totalUtilities(d) +
      (d.manual["Card Processing Fees"] || 0) + (d.manual["Office Administration Fees"] || 0) +
      (d.manual["Other Expenses"] || 0) + (d.manual["Miscellaneous Expenses"] || 0) + otherUnknown;
  };
  lines.push({ label: "", type: "divider", getValue: () => undefined });
  lines.push({ label: "Total Operating Expenses", type: "total", getValue: (d) => totalOpex(d), bold: true });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // EBITDA
  // ═══════════════════════════════════════════════
  const ebitda = (d: PLPeriodData) => d.totalRevenue + totalOpex(d);
  lines.push({ label: "EBITDA", type: "total", getValue: (d) => ebitda(d), bold: true, highlight: true });
  lines.push({ label: "EBITDA Margin", type: "ratio", getValue: (d) => pct(ebitda(d), d.totalRevenue) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // D&A
  // ═══════════════════════════════════════════════
  lines.push({ label: "Depreciation & Amortisation", type: "header", getValue: () => undefined });
  lines.push({ label: "Depreciation", type: "editable", indent: 1, getValue: m("Depreciation"), manualKey: "Depreciation" });
  lines.push({ label: "Amortisation", type: "editable", indent: 1, getValue: m("Amortization"), manualKey: "Amortization" });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // NET OPERATING PROFIT
  // ═══════════════════════════════════════════════
  const ebit_raw = (d: PLPeriodData) => ebitda(d) + (d.manual["Depreciation"] || 0) + (d.manual["Amortization"] || 0);
  lines.push({ label: "", type: "divider", getValue: () => undefined });
  lines.push({ label: "Net Operating Profit (EBIT)", type: "total", getValue: (d) => ebit_raw(d), bold: true, highlight: true });
  lines.push({ label: "Net Margin", type: "ratio", getValue: (d) => pct(ebit_raw(d), d.totalRevenue) });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ═══════════════════════════════════════════════
  // KEY RATIOS
  // ═══════════════════════════════════════════════
  lines.push({ label: "Key Performance Ratios", type: "header", getValue: () => undefined });
  lines.push({ label: "Cost of Sales %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalCOGS(d)), d.totalRevenue) });
  lines.push({ label: "Labour Cost %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalSalary(d)), d.totalRevenue) });
  lines.push({ label: "Occupancy Cost %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalRent(d)), d.totalRevenue) });
  lines.push({ label: "Prime Cost %", type: "ratio", indent: 1, getValue: (d) => pct(Math.abs(totalCOGS(d)) + Math.abs(totalSalary(d)), d.totalRevenue) });

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

  const periods = useMemo<PLPeriodKey[]>(
    () => [...selectedMonths].sort((a, b) => a - b).map((m) => ({ year, month: m })),
    [year, selectedMonths]
  );

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
      prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m]
    );
  };

  const selectAll = () => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i + 1));
  const selectQ = (q: number) => {
    const start = (q - 1) * 3 + 1;
    setSelectedMonths([start, start + 1, start + 2]);
  };

  const monthLabel =
    selectedMonths.length === 12
      ? "Full Year"
      : selectedMonths.length === 1
      ? FULL_MONTHS[selectedMonths[0] - 1]
      : `${selectedMonths.length} Months`;

  const periodRangeLabel = useMemo(() => {
    if (selectedMonths.length === 12) return `FY ${year}`;
    if (selectedMonths.length === 1) return `${FULL_MONTHS[selectedMonths[0] - 1]} ${year}`;
    const sorted = [...selectedMonths].sort((a, b) => a - b);
    return `${MONTHS[sorted[0] - 1]} – ${MONTHS[sorted[sorted.length - 1] - 1]} ${year}`;
  }, [selectedMonths, year]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight">
                <span className="text-gradient-gold">Profit & Loss Statement</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Khambu Group — Consolidated
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="font-medium">{periodRangeLabel}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              {monthLabel} <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="flex gap-1 mb-2 flex-wrap">
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={selectAll}>Full Year</Button>
              {[1, 2, 3, 4].map((q) => (
                <Button key={q} variant="ghost" size="sm" className="text-xs h-6" onClick={() => selectQ(q)}>Q{q}</Button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MONTHS.map((m, i) => (
                <label key={i} className="flex items-center gap-1.5 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-accent/30">
                  <Checkbox
                    checked={selectedMonths.includes(i + 1)}
                    onCheckedChange={() => toggleMonth(i + 1)}
                    className="h-3.5 w-3.5"
                  />
                  {m}
                </label>
              ))}
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
      {loading ? (
        <div className="card-glass rounded-xl p-12 text-center">
          <p className="text-muted-foreground animate-pulse">Preparing statement…</p>
        </div>
      ) : (
        <div className="card-glass rounded-xl overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-primary/20">
                <th className="text-left px-5 py-3 font-semibold text-foreground sticky left-0 bg-card z-10 min-w-[240px] text-xs uppercase tracking-wider">
                  Description
                </th>
                {periodData.map((pd) => (
                  <th key={pd.label} className="text-right px-4 py-3 font-semibold text-foreground whitespace-nowrap min-w-[120px] text-xs uppercase tracking-wider">
                    {pd.label}
                  </th>
                ))}
                {showTotal && (
                  <th className="text-right px-4 py-3 font-bold whitespace-nowrap min-w-[120px] border-l-2 border-primary/20 text-xs uppercase tracking-wider">
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                if (line.type === "blank") {
                  return <tr key={i}><td colSpan={99} className="h-1" /></tr>;
                }
                if (line.type === "divider") {
                  return (
                    <tr key={i}>
                      <td colSpan={99} className="px-5">
                        <div className="border-t border-foreground/20 my-0.5" />
                      </td>
                    </tr>
                  );
                }

                const indent = (line.indent || 0) * 20;
                const isHeader = line.type === "header";
                const isSection = line.type === "section" || line.type === "subheader";
                const isTotal = line.type === "total" || line.type === "subtotal";
                const isRatio = line.type === "ratio";
                const isEditable = line.type === "editable";
                const isHighlight = line.highlight;

                return (
                  <tr
                    key={i}
                    className={[
                      isHeader ? "bg-primary/[0.06]" : "",
                      isHighlight ? "bg-primary/[0.04]" : "",
                      isTotal && line.bold && !isHighlight ? "bg-muted/40" : "",
                      "transition-colors",
                    ].filter(Boolean).join(" ")}
                  >
                    <td
                      className={[
                        "px-5 py-1.5 sticky left-0 z-10",
                        isHeader ? "bg-primary/[0.06] font-semibold text-foreground uppercase text-xs tracking-wide pt-3 pb-1.5" : "",
                        isHighlight && !isHeader ? "bg-primary/[0.04]" : "",
                        isTotal && !isHighlight ? (line.bold ? "bg-muted/40 font-semibold text-foreground" : "font-medium text-foreground") : "",
                        isSection ? "font-medium text-muted-foreground text-xs uppercase tracking-wide" : "",
                        isRatio ? "italic text-muted-foreground text-xs" : "",
                        isEditable ? "bg-card text-foreground" : "",
                        !isHeader && !isSection && !isTotal && !isRatio && !isEditable ? "bg-card" : "",
                      ].filter(Boolean).join(" ")}
                      style={{ paddingLeft: 20 + indent }}
                    >
                      {line.label}
                    </td>
                    {periodData.map((pd) => {
                      const val = line.getValue(pd.data);
                      if (isEditable && line.manualKey && !hideEditValues) {
                        return (
                          <td key={pd.label} className="px-2 py-0.5 text-right">
                            <PLInlineCell
                              lineItemName={line.manualKey}
                              year={pd.key.year}
                              month={pd.key.month}
                              currentValue={typeof val === "number" ? val : 0}
                              onSaved={refetch}
                            />
                          </td>
                        );
                      }
                      const isNeg = typeof val === "number" && val < 0;
                      return (
                        <td
                          key={pd.label}
                          className={[
                            "px-4 py-1.5 text-right font-mono tabular-nums text-sm",
                            isNeg ? "text-destructive" : "",
                            isTotal && line.bold ? "font-bold" : isTotal ? "font-semibold" : "",
                            isRatio ? "text-muted-foreground text-xs" : "",
                            isHighlight ? "font-bold" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          {val === undefined ? "" : typeof val === "number" ? fmt(val) : val}
                        </td>
                      );
                    })}
                    {showTotal &&
                      (() => {
                        const val = line.getValue(totals);
                        const isNeg = typeof val === "number" && val < 0;
                        return (
                          <td
                            className={[
                              "px-4 py-1.5 text-right font-mono tabular-nums border-l-2 border-primary/20 text-sm",
                              isNeg ? "text-destructive" : "",
                              isTotal && line.bold ? "font-bold" : isTotal ? "font-semibold" : "",
                              isRatio ? "text-muted-foreground text-xs" : "",
                              isHighlight ? "font-bold" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            {val === undefined ? "" : typeof val === "number" ? fmt(val) : val}
                          </td>
                        );
                      })()}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!hideAddLineItem && (
            <div className="border-t border-border/50">
              <PLAddLineItem year={year} months={selectedMonths} onAdded={refetch} />
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border/50 px-5 py-2 text-[10px] text-muted-foreground/70 italic">
            Prepared for internal management use only. Figures may not align with statutory accounts. Negative amounts shown in parentheses.
          </div>
        </div>
      )}
    </div>
  );
}
