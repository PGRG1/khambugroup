import { useState, useMemo } from "react";
import { usePLMultiPeriod, KNOWN_LINES, type PLPeriodKey, type PLPeriodData } from "@/hooks/usePLData";
import { PLInlineCell } from "@/components/pl/PLInlineCell";
import { PLAddLineItem } from "@/components/pl/PLAddLineItem";
import { PLManualInputEditor } from "@/components/pl/PLManualInputEditor";
import { PLPeriodSelector, getDefaultPeriod, type ViewMode, type PeriodOption } from "@/components/pl/PLPeriodSelector";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { generatePLReportPDF } from "@/utils/generatePLReport";

const fmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, d: number) => d === 0 ? "—" : `${(n / d * 100).toFixed(1)}%`;

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

function buildLines(allUnknownNames: string[], venueNames: string[]): Line[] {
  const m = (key: string) => (d: PLPeriodData) => d.manual[key] || 0;
  const lines: Line[] = [];

  // ── Revenue (dynamic per venue) ──
  lines.push({ label: "Revenue", type: "header", getValue: () => undefined });
  
  for (const venueName of venueNames) {
    lines.push({ label: venueName, type: "subheader", indent: 1, getValue: () => undefined });
    lines.push({ label: "Gross Revenue", type: "item", indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.grossRevenue || 0 });
    lines.push({ label: "Service Charge", type: "item", indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.serviceChargeRevenue || 0 });
    lines.push({ label: "Discounts", type: "item", indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.discounts || 0 });
    lines.push({ label: "Net Sales", type: "subtotal", indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.netSales || 0 });
    lines.push({ label: "", type: "blank", getValue: () => undefined });
  }

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
    (d.manual["Base Rental"] || 0) + (d.manual["Rental Share (-)"] || 0) +
    (d.manual["Government Fees"] || 0) + (d.manual["Management Fees"] || 0);
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
    lines.push({
      label: name, type: "editable", indent: 2, getValue: (d) => {
        const found = d.unknownManualLines.find((u) => u.name === name);
        return found ? found.amount : 0;
      }, manualKey: name
    });
  }
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  const totalOpex = (d: PLPeriodData) => {
    const otherUnknown = d.unknownManualLines.reduce((s, l) => s + l.amount, 0);
    return totalCOGS(d) + totalRent(d) + totalSalary(d) + totalUtilities(d) +
      (d.manual["Card Processing Fees"] || 0) + (d.manual["Office Administration Fees"] || 0) +
      (d.manual["Other Expenses"] || 0) + (d.manual["Miscellaneous Expenses"] || 0) + otherUnknown;
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

  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedPeriods, setSelectedPeriods] = useState<PeriodOption[]>(() => getDefaultPeriod("monthly"));

  // Flatten selected periods into PLPeriodKey[]
  const allPeriodKeys = useMemo<PLPeriodKey[]>(() => {
    const keys: PLPeriodKey[] = [];
    const seen = new Set<string>();
    for (const sp of selectedPeriods) {
      for (const month of sp.months) {
        const k = `${sp.year}-${month}`;
        if (!seen.has(k)) {
          seen.add(k);
          keys.push({ year: sp.year, month });
        }
      }
    }
    return keys.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
  }, [selectedPeriods]);

  const { periodData, totals, loading, refetch } = usePLMultiPeriod(allPeriodKeys);

  // Group period data per selected period option
  const groupedData = useMemo(() => {
    return selectedPeriods.map(sp => {
      const agg: PLPeriodData = {
        venues: [], totalRevenue: 0,
        manual: {}, unknownManualLines: [],
      };
      const venueMap = new Map<string, { venue: string; grossRevenue: number; serviceChargeRevenue: number; discounts: number; netSales: number }>();
      const unknownMap: Record<string, number> = {};

      for (const month of sp.months) {
        const pd = periodData.find(p => p.key.year === sp.year && p.key.month === month);
        if (!pd) continue;
        const d = pd.data;
        for (const v of d.venues) {
          if (!venueMap.has(v.venue)) {
            venueMap.set(v.venue, { venue: v.venue, grossRevenue: 0, serviceChargeRevenue: 0, discounts: 0, netSales: 0 });
          }
          const target = venueMap.get(v.venue)!;
          target.grossRevenue += v.grossRevenue;
          target.serviceChargeRevenue += v.serviceChargeRevenue;
          target.discounts += v.discounts;
          target.netSales += v.netSales;
        }
        agg.totalRevenue += d.totalRevenue;
        for (const [k, v] of Object.entries(d.manual)) {
          agg.manual[k] = (agg.manual[k] || 0) + v;
        }
        for (const ul of d.unknownManualLines) {
          unknownMap[ul.name] = (unknownMap[ul.name] || 0) + ul.amount;
        }
      }
      for (const k of KNOWN_LINES) {
        if (!(k in agg.manual)) agg.manual[k] = 0;
      }
      agg.venues = [...venueMap.values()].sort((a, b) => a.venue.localeCompare(b.venue));
      agg.unknownManualLines = Object.entries(unknownMap).map(([name, amount]) => ({ name, amount }));
      return { label: sp.label, data: agg, months: sp.months, year: sp.year };
    });
  }, [selectedPeriods, periodData]);

  const allUnknownNames = useMemo(() => {
    const names = new Set<string>();
    for (const pd of periodData) {
      for (const ul of pd.data.unknownManualLines) names.add(ul.name);
    }
    return [...names].sort();
  }, [periodData]);

  // Collect all venue names across all periods
  const allVenueNames = useMemo(() => {
    const names = new Set<string>();
    for (const pd of periodData) {
      for (const v of pd.data.venues) names.add(v.venue);
    }
    return [...names].sort();
  }, [periodData]);

  const lines = useMemo(() => buildLines(allUnknownNames, allVenueNames), [allUnknownNames, allVenueNames]);

  const showTotal = groupedData.length > 1;
  const canInlineEdit = viewMode === "monthly" && !hideEditValues;

  const allMonths = useMemo(() => {
    const s = new Set<number>();
    selectedPeriods.forEach(sp => sp.months.forEach(m => s.add(m)));
    return [...s].sort((a, b) => a - b);
  }, [selectedPeriods]);

  const handleExportPDF = () => {
    const periodLabel = selectedPeriods.map(p => p.label).join(", ");
    generatePLReportPDF({
      lines: lines as any,
      columns: groupedData.map(gd => ({ label: gd.label, data: gd.data })),
      totals,
      showTotal,
      periodLabel,
    });
  };

  return (
    <div className="max-w-[1920px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">P&L Report</span>
            <span className="text-muted-foreground ml-2 text-base font-normal">{allVenueNames.length > 0 ? allVenueNames.join(" + ") : "All Venues"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Note: Prepared for internal management use only. This P&L is based on management reporting conventions and may not align with statutory financial statements or formal accounting policies.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <PLPeriodSelector
          viewMode={viewMode}
          selectedPeriods={selectedPeriods}
          onViewModeChange={setViewMode}
          onPeriodsChange={setSelectedPeriods}
        />

        {!hideEditValues && (
          <div className="ml-auto">
            <PLManualInputEditor onSave={refetch} />
          </div>
        )}
      </div>

      {/* P&L Table */}
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : selectedPeriods.length === 0 ? (
        <p className="text-muted-foreground">Select at least one period to view the P&L report.</p>
      ) : (
        <div className="pl-table rounded-xl border border-[hsl(var(--pl-border))] overflow-x-auto relative" style={{ boxShadow: '0 2px 16px -4px hsl(222 30% 14% / 0.06)' }}>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest sticky left-0 z-20 min-w-[230px] border-b-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(var(--pl-header))' }}>
                  P&L
                </th>
                {groupedData.map((gd) => (
                  <th key={gd.label} className="text-right px-4 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest whitespace-nowrap min-w-[120px] border-b-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(var(--pl-header))' }}>
                    {gd.label}
                  </th>
                ))}
                {showTotal && (
                  <th className="text-right px-4 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest whitespace-nowrap min-w-[120px] border-b-2 border-l-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(var(--pl-grand-total))' }}>
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let rowIdx = 0;
                return lines.map((line, i) => {
                  if (line.type === "blank") return <tr key={i}><td colSpan={99} className="h-px" style={{ background: 'hsl(var(--pl-border))' }} /></tr>;

                  const indent = (line.indent || 0) * 20;
                  const isHeader = line.type === "header";
                  const isSection = line.type === "section" || line.type === "subheader";
                  const isTotal = line.type === "total" || line.type === "subtotal";
                  const isRatio = line.type === "ratio";
                  const isEditable = line.type === "editable";

                  let rowBg: string;
                  if (isHeader) {
                    rowBg = "hsl(var(--pl-header))";
                  } else if (isTotal && line.bold) {
                    rowBg = "hsl(var(--pl-grand-total))";
                  } else if (isTotal) {
                    rowBg = "hsl(var(--pl-total))";
                  } else if (isSection) {
                    rowBg = "hsl(var(--pl-section))";
                  } else if (isRatio) {
                    rowBg = "hsl(var(--pl-ratio))";
                  } else {
                    rowBg = rowIdx % 2 === 0 ? "hsl(var(--pl-row-even))" : "hsl(var(--pl-row-odd))";
                    rowIdx++;
                  }

                  const borderStyle = isHeader
                    ? { borderBottom: '1px solid hsl(var(--pl-border))' }
                    : (isTotal && line.bold)
                    ? { borderTop: '2px solid hsl(var(--primary))', borderBottom: '1px solid hsl(var(--pl-border))' }
                    : isTotal
                    ? { borderTop: '1px solid hsl(var(--pl-border))', borderBottom: '1px solid hsl(var(--pl-border))' }
                    : {};

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

                  const valueCellClass = (isNeg: boolean) =>
                    `px-4 py-[7px] text-right font-mono tabular-nums text-[13px] ${
                      isNeg ? "text-destructive" : isRatio ? "text-muted-foreground" : "text-foreground/75"
                    } ${isTotal && line.bold ? "font-bold" : isTotal ? "font-semibold" : ""}`;

                  return (
                    <tr key={i} style={{ background: rowBg, ...borderStyle }}>
                      <td
                        className={`px-5 py-[7px] sticky left-0 z-10 ${labelClass}`}
                        style={{ paddingLeft: 20 + indent, background: rowBg }}
                      >
                        {line.label}
                      </td>
                      {groupedData.map((gd) => {
                        const val = line.getValue(gd.data);
                        if (isEditable && line.manualKey && canInlineEdit && gd.months.length === 1) {
                          return (
                            <td key={gd.label} className="px-3 py-0.5 text-right" style={{ background: rowBg }}>
                              <PLInlineCell
                                lineItemName={line.manualKey}
                                year={gd.year}
                                month={gd.months[0]}
                                currentValue={typeof val === "number" ? val : 0}
                                onSaved={refetch}
                              />
                            </td>
                          );
                        }
                        const isNeg = typeof val === "number" && val < 0;
                        return (
                          <td key={gd.label} className={valueCellClass(isNeg)} style={{ background: rowBg }}>
                            {val === undefined ? "" : typeof val === "number" ? fmt(val) : val}
                          </td>
                        );
                      })}
                      {showTotal && (() => {
                        const val = line.getValue(totals);
                        const isNeg = typeof val === "number" && val < 0;
                        return (
                          <td className={`${valueCellClass(isNeg)} ${isEditable ? "font-medium" : ""}`} style={{ borderLeft: '2px solid hsl(var(--pl-border))', background: rowBg }}>
                            {val === undefined ? "" : typeof val === "number" ? fmt(val) : val}
                          </td>
                        );
                      })()}
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>

          {!hideAddLineItem && (
            <div style={{ borderTop: '2px solid hsl(var(--pl-border))' }}>
              <PLAddLineItem year={selectedPeriods[0]?.year || new Date().getFullYear()} months={allMonths} onAdded={refetch} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
