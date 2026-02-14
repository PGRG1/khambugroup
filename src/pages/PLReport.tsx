import { useState, useMemo } from "react";
import { usePLData } from "@/hooks/usePLData";
import { PLManualInputEditor } from "@/components/pl/PLManualInputEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, d: number) => d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`;

type LineType = "header" | "subheader" | "item" | "total" | "subtotal" | "ratio" | "blank" | "section";

interface Line {
  label: string;
  value?: number | string;
  type: LineType;
  indent?: number;
}

export default function PLReport() {
  const [view, setView] = useState<"monthly" | "annual">("monthly");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { plData, loading, refetch } = usePLData(view, year, month);

  const lines = useMemo<Line[]>(() => {
    const m = plData.manual;
    const a = plData.assembly;
    const c = plData.caliente;
    const tr = plData.totalRevenue;

    const beverageCost = m["Beverage Cost"];
    const foodCost = m["Food Cost"];
    const totalCOGS = beverageCost + foodCost;
    const grossProfit = tr - totalCOGS;

    const baseRental = m["Base Rental"];
    const rentalShare = m["Rental Share (-)"];
    const govFees = m["Government Fees"];
    const mgmtFees = m["Management Fees"];
    const totalRental = baseRental + rentalShare + govFees + mgmtFees;

    const fteSalary = m["FTE Salary"];
    const fteMPF = m["FTE MPF"];
    const totalFTE = fteSalary + fteMPF;
    const pteSalary = m["PTE Salary"];
    const pteMPF = m["PTE MPF"];
    const totalPTE = pteSalary + pteMPF;
    const totalSalary = totalFTE + totalPTE;

    const electricity = m["Electricity"];
    const water = m["Water"];
    const hkt = m["HKT/PCCW"];
    const totalUtilities = electricity + water + hkt;

    const cardFees = m["Card Processing Fees"];
    const officeFees = m["Office Administration Fees"];
    const otherExp = m["Other Expenses"];
    const miscExp = m["Miscellaneous Expenses"];
    const depreciation = m["Depreciation"];
    const amortization = m["Amortization"];

    // Unknown lines go into "Other Expenses"
    const unknownTotal = plData.unknownManualLines.reduce((s, l) => s + l.amount, 0);
    const otherExpTotal = otherExp + unknownTotal;

    const totalOpex = totalCOGS + totalRental + totalSalary + totalUtilities + cardFees + officeFees + otherExpTotal + miscExp + depreciation + amortization;
    const ebit = tr - totalOpex;
    const ebitda = ebit + depreciation + amortization;

    const result: Line[] = [
      { label: "Revenue", type: "header" },
      { label: "Assembly:", type: "subheader", indent: 1 },
      { label: "Gross Revenue", value: a.grossRevenue, type: "item", indent: 2 },
      { label: "Service Charge Revenue", value: a.serviceChargeRevenue, type: "item", indent: 2 },
      { label: "Discounts", value: a.discounts, type: "item", indent: 2 },
      { label: "Net Sales", value: a.netSales, type: "subtotal", indent: 2 },
      { label: "", type: "blank" },
      { label: "Caliente:", type: "subheader", indent: 1 },
      { label: "Gross Revenue", value: c.grossRevenue, type: "item", indent: 2 },
      { label: "Service Charge Revenue", value: c.serviceChargeRevenue, type: "item", indent: 2 },
      { label: "Discounts", value: c.discounts, type: "item", indent: 2 },
      { label: "Net Sales", value: c.netSales, type: "subtotal", indent: 2 },
      { label: "", type: "blank" },
      { label: "Total Revenue", value: tr, type: "total" },
      { label: "", type: "blank" },

      { label: "Cost of Goods Sold:", type: "header" },
      { label: "Beverage Cost", value: beverageCost, type: "item", indent: 1 },
      { label: "Food Cost", value: foodCost, type: "item", indent: 1 },
      { label: "Total Cost of Goods Sold", value: totalCOGS, type: "total", indent: 1 },
      { label: "", type: "blank" },

      { label: "Gross Profit", value: grossProfit, type: "total" },
      { label: "Gross Margin", value: pct(grossProfit, tr), type: "ratio" },
      { label: "", type: "blank" },

      { label: "Operating Expenses", type: "header" },
      { label: "", type: "blank" },

      { label: "Rent and related:", type: "section", indent: 1 },
      { label: "Base Rental", value: baseRental, type: "item", indent: 2 },
      { label: "Rental Share (-)", value: rentalShare, type: "item", indent: 2 },
      { label: "Government Fees", value: govFees, type: "item", indent: 2 },
      { label: "Management Fees", value: mgmtFees, type: "item", indent: 2 },
      { label: "Total Rental related Expenses", value: totalRental, type: "subtotal", indent: 2 },
      { label: "", type: "blank" },

      { label: "Salaries:", type: "section", indent: 1 },
      { label: "FTE Salary", value: fteSalary, type: "item", indent: 2 },
      { label: "FTE MPF", value: fteMPF, type: "item", indent: 2 },
      { label: "Total FTE Expenses", value: totalFTE, type: "subtotal", indent: 2 },
      { label: "PTE Salary", value: pteSalary, type: "item", indent: 2 },
      { label: "PTE MPF", value: pteMPF, type: "item", indent: 2 },
      { label: "Total PTE Expenses", value: totalPTE, type: "subtotal", indent: 2 },
      { label: "Total Salary Expenses", value: totalSalary, type: "subtotal", indent: 2 },
      { label: "", type: "blank" },

      { label: "Utilities:", type: "section", indent: 1 },
      { label: "Electricity", value: electricity, type: "item", indent: 2 },
      { label: "Water", value: water, type: "item", indent: 2 },
      { label: "HKT/PCCW", value: hkt, type: "item", indent: 2 },
      { label: "", type: "blank" },

      { label: "Other Operating Expenses:", type: "section", indent: 1 },
      { label: "Card Processing Fees", value: cardFees, type: "item", indent: 2 },
      { label: "Office Administration Fees", value: officeFees, type: "item", indent: 2 },
      { label: "Other Expenses", value: otherExpTotal, type: "item", indent: 2 },
    ];

    // Show unknown manual lines as sub-items under Other Expenses
    for (const ul of plData.unknownManualLines) {
      result.push({ label: `  └ ${ul.name}`, value: ul.amount, type: "item", indent: 3 });
    }

    result.push(
      { label: "Miscellaneous Expenses", value: miscExp, type: "item", indent: 2 },
      { label: "Depreciation", value: depreciation, type: "item", indent: 2 },
      { label: "Amortization", value: amortization, type: "item", indent: 2 },
      { label: "", type: "blank" },

      { label: "Total Operating Expenses", value: totalOpex, type: "total" },
      { label: "", type: "blank" },

      { label: "Operating Income (EBIT)", value: ebit, type: "total" },
      { label: "EBITDA", value: ebitda, type: "total" },
      { label: "EBITDA Margin", value: pct(ebitda, tr), type: "ratio" },
      { label: "Net Operating Profit", value: ebit, type: "total" },
      { label: "", type: "blank" },

      { label: "Key Ratios:", type: "header" },
      { label: "COGS %", value: pct(totalCOGS, tr), type: "ratio", indent: 1 },
      { label: "Labor Cost %", value: pct(totalSalary, tr), type: "ratio", indent: 1 },
      { label: "Rent %", value: pct(totalRental, tr), type: "ratio", indent: 1 },
    );

    return result;
  }, [plData]);

  const periodLabel = view === "monthly" ? `${MONTHS[month - 1]} ${year}` : `${year}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">P&L Report (Caliente + Assembly)</h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Note: This management report is prepared for internal decision‑making purposes and may not fully conform to formal financial reporting standards or accounting policies.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={view} onValueChange={(v: "monthly" | "annual") => setView(v)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        {view === "monthly" && (
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="ml-auto">
          <PLManualInputEditor onSave={refetch} />
        </div>
      </div>

      {/* P&L Table */}
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="card-glass rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-border">
            <p className="text-sm font-medium text-muted-foreground">{periodLabel}</p>
          </div>
          <div className="divide-y divide-border/50">
            {lines.map((line, i) => {
              if (line.type === "blank") return <div key={i} className="h-2" />;
              const indent = (line.indent || 0) * 24;
              const isNeg = typeof line.value === "number" && line.value < 0;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between px-6 py-1.5 ${
                    line.type === "header" ? "bg-muted/60 font-semibold text-sm" :
                    line.type === "total" ? "font-semibold text-sm border-t border-border" :
                    line.type === "subtotal" ? "font-medium text-sm" :
                    line.type === "section" || line.type === "subheader" ? "font-medium text-sm text-muted-foreground" :
                    line.type === "ratio" ? "text-sm text-muted-foreground italic" :
                    "text-sm"
                  }`}
                >
                  <span style={{ paddingLeft: indent }}>{line.label}</span>
                  {line.value !== undefined && (
                    <span className={`font-mono text-sm tabular-nums ${isNeg ? "text-destructive" : ""} ${
                      line.type === "total" ? "font-semibold" : ""
                    }`}>
                      {typeof line.value === "number" ? fmt(line.value) : line.value}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
