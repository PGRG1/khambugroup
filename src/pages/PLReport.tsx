import { useState, useMemo } from "react";
import { usePLMultiPeriod, KNOWN_LINES, type PLPeriodKey, type PLPeriodData } from "@/hooks/usePLData";
import { usePLStructure, type PLStructureRow } from "@/hooks/usePLStructure";
import { PLInlineCell } from "@/components/pl/PLInlineCell";
import { PLManualInputEditor } from "@/components/pl/PLManualInputEditor";
import { PLStructureEditor } from "@/components/pl/PLStructureEditor";
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

function buildLines(structure: PLStructureRow[], venueNames: string[]): Line[] {
  const m = (key: string) => (d: PLPeriodData) => d.manual[key] || 0;
  const lines: Line[] = [];

  // ── Revenue (dynamic per venue, data-derived) ──
  lines.push({ label: "Revenue", type: "header", getValue: () => undefined });
  for (const venueName of venueNames) {
    lines.push({ label: venueName, type: "subheader", indent: 1, getValue: () => undefined });
    lines.push({ label: "Gross Revenue",  type: "item",     indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.grossRevenue || 0 });
    lines.push({ label: "Service Charge", type: "item",     indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.serviceChargeRevenue || 0 });
    lines.push({ label: "Discounts",      type: "item",     indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.discounts || 0 });
    lines.push({ label: "Net Sales",      type: "subtotal", indent: 2, getValue: (d) => d.venues.find(v => v.venue === venueName)?.netSales || 0 });
    lines.push({ label: "", type: "blank", getValue: () => undefined });
  }
  lines.push({ label: "Total Revenue", type: "total", getValue: (d) => d.totalRevenue, bold: true });
  lines.push({ label: "", type: "blank", getValue: () => undefined });

  // ── Editable middle block (driven by pl_structure_rows) ──
  // Sum rows auto-total the item rows above them, back to the previous sum/section.
  // Track running sum of items since last "boundary" (sum/section/start).
  let runningItems: ((d: PLPeriodData) => number)[] = [];
  for (const row of structure) {
    if (row.kind === "section") {
      lines.push({
        label: row.label,
        type: row.indent === 0 ? "header" : "section",
        indent: row.indent,
        getValue: () => undefined,
      });
      runningItems = []; // boundary
    } else if (row.kind === "spacer") {
      lines.push({ label: "", type: "blank", getValue: () => undefined });
    } else if (row.kind === "item") {
      const getter = m(row.label);
      runningItems.push(getter);
      lines.push({
        label: row.label,
        type: "editable",
        indent: row.indent,
        getValue: getter,
        manualKey: row.label,
      });
    } else if (row.kind === "sum") {
      const itemsToSum = [...runningItems];
      const sumGetter = (d: PLPeriodData) => itemsToSum.reduce((s, g) => s + g(d), 0);
      lines.push({
        label: row.label,
        type: "subtotal",
        indent: row.indent,
        bold: row.is_bold,
        getValue: sumGetter,
      });
      runningItems = []; // boundary
    }
  }

  // ── Computed footer (auto-derived from Revenue + signed sum of every item) ──
  const totalItems = (d: PLPeriodData) => Object.values(d.manual).reduce((s, v) => s + (v || 0), 0);
  const grossProfit = (d: PLPeriodData) => d.totalRevenue + totalItems(d);
  // Keep simple bottom-line: treat items as signed (costs negative). User is responsible for signs.

  lines.push({ label: "", type: "blank", getValue: () => undefined });
  lines.push({ label: "Operating Result", type: "total", getValue: (d) => grossProfit(d), bold: true });
  lines.push({ label: "Operating Margin", type: "ratio", getValue: (d) => pct(grossProfit(d), d.totalRevenue) });

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

  const { rows: structure, refetch: refetchStructure } = usePLStructure();
  const lines = useMemo(() => buildLines(structure, allVenueNames), [structure, allVenueNames]);

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
            <span className="text-gradient-gold">Profit & Loss Report</span>
            <span className="text-muted-foreground ml-2 text-base font-normal">{allVenueNames.length > 0 ? allVenueNames.join(" + ") : "All Venues"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Note: Prepared for internal management use only. This Profit & Loss is based on management reporting conventions and may not align with statutory financial statements or formal accounting policies.
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

      {/* Profit & Loss Table */}
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : selectedPeriods.length === 0 ? (
        <p className="text-muted-foreground">Select at least one period to view the Profit & Loss report.</p>
      ) : (
        <div className="pl-table rounded-xl border border-[hsl(var(--pl-border))] overflow-x-auto relative" style={{ boxShadow: '0 2px 16px -4px hsl(25 20% 15% / 0.07)' }}>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest sticky left-0 z-20 min-w-[230px] border-b-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(30, 18%, 86%)' }}>
                  Profit & Loss
                </th>
                {groupedData.map((gd) => (
                  <th key={gd.label} className="text-right px-4 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest whitespace-nowrap min-w-[120px] border-b-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(30, 18%, 86%)' }}>
                    {gd.label}
                  </th>
                ))}
                {showTotal && (
                  <th className="text-right px-4 py-3 font-semibold text-foreground/70 uppercase text-[11px] tracking-widest whitespace-nowrap min-w-[120px] border-b-2 border-l-2 border-[hsl(var(--pl-border))]" style={{ background: 'hsl(28, 22%, 83%)' }}>
                    Total
                  </th>
                )}
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
                    rowBg = rowIdx % 2 === 0 ? "hsl(33, 22%, 95%)" : "hsl(35, 28%, 97.5%)";
                    rowIdx++;
                  }

                  const borderStyle = isHeader
                    ? { borderBottom: '1px solid hsl(30, 12%, 82%)' }
                    : (isTotal && line.bold)
                    ? { borderTop: '2px solid hsl(24, 20%, 78%)', borderBottom: '1px solid hsl(30, 12%, 85%)' }
                    : isTotal
                    ? { borderTop: '1px solid hsl(30, 12%, 85%)', borderBottom: '1px solid hsl(30, 12%, 88%)' }
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
                          <td className={`${valueCellClass(isNeg)} ${isEditable ? "font-medium" : ""}`} style={{ borderLeft: '2px solid hsl(30, 12%, 82%)', background: rowBg }}>
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

        </div>
      )}
    </div>
  );
}
