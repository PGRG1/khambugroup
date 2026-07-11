import { useMemo, useState } from "react";
import { useCashflowStatement } from "@/hooks/useCashflowStatement";
import { useVenues } from "@/hooks/useVenues";
import { SECTION_LABELS, SECTION_ORDER, CashflowSection } from "@/utils/cashflowStatementClassifier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, FileDown, FileText, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { generateCashflowPDF } from "@/utils/financePdfReports";

const fmt = (n: number) => {
  const v = Math.abs(n).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${v})` : v;
};
const fmtMoney = (n: number) =>
  n.toLocaleString("en-HK", { style: "currency", currency: "HKD", maximumFractionDigits: 0 });

type PeriodPreset = "mtd" | "qtd" | "ytd" | "month" | "year" | "custom";

function getPresetRange(preset: PeriodPreset): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "mtd":
      return { from: iso(new Date(y, m, 1)), to: iso(today) };
    case "qtd": {
      const qStart = Math.floor(m / 3) * 3;
      return { from: iso(new Date(y, qStart, 1)), to: iso(today) };
    }
    case "ytd":
      return { from: `${y}-01-01`, to: iso(today) };
    case "month": {
      const last = new Date(y, m + 1, 0);
      return { from: iso(new Date(y, m, 1)), to: iso(last) };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: `${y}-01-01`, to: iso(today) };
  }
}

export default function CashflowStatement() {
  const [preset, setPreset] = useState<PeriodPreset>("ytd");
  const initial = getPresetRange("ytd");
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [venueFilter, setVenueFilter] = useState<string>("All Venues");
  const [openSection, setOpenSection] = useState<Record<string, boolean>>({});

  const handlePreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = getPresetRange(p);
      setFromDate(r.from);
      setToDate(r.to);
    }
  };

  const { loading, opening, closing, netChange, lines, sectionTotals, unclassified, cashAccounts } =
    useCashflowStatement({ fromDate, toDate, venueFilter });

  const linesBySection = useMemo(() => {
    const m: Record<CashflowSection, typeof lines> = { operating: [], investing: [], financing: [] };
    lines.forEach((l) => m[l.section].push(l));
    return m;
  }, [lines]);

  const cashBalanceTotal = useMemo(
    () => cashAccounts.reduce((s, a) => s + a.balance, 0),
    [cashAccounts],
  );
  const reconciliationDelta = closing - cashBalanceTotal;
  const reconciles = Math.abs(reconciliationDelta) < 0.01;

  const handleExport = () => {
    const rows: Array<{ section: string; line: string; amount: string }> = [];
    rows.push({ section: "", line: "Opening cash & cash equivalents", amount: opening.toFixed(2) });
    SECTION_ORDER.forEach((sec) => {
      rows.push({ section: SECTION_LABELS[sec].toUpperCase(), line: "", amount: "" });
      linesBySection[sec].forEach((l) =>
        rows.push({ section: "", line: l.lineItem, amount: l.amount.toFixed(2) }),
      );
      rows.push({ section: "", line: `Net cash from ${sec} activities`, amount: sectionTotals[sec].toFixed(2) });
    });
    rows.push({ section: "", line: "Net increase / (decrease) in cash", amount: netChange.toFixed(2) });
    rows.push({ section: "", line: "Closing cash & cash equivalents", amount: closing.toFixed(2) });
    downloadCSV(
      rows,
      [
        { key: "section", label: "Section" },
        { key: "line", label: "Line item" },
        { key: "amount", label: "Amount (HKD)" },
      ],
      `cashflow_statement_${fromDate}_${toDate}`,
    );
  };

  const handleExportPDF = () => {
    generateCashflowPDF({
      fromDate,
      toDate,
      venueLabel: venueFilter,
      opening,
      closing,
      netChange,
      sectionTotals,
      linesBySection: {
        operating: linesBySection.operating.map((l) => ({ section: l.section, lineItem: l.lineItem, amount: l.amount })),
        investing: linesBySection.investing.map((l) => ({ section: l.section, lineItem: l.lineItem, amount: l.amount })),
        financing: linesBySection.financing.map((l) => ({ section: l.section, lineItem: l.lineItem, amount: l.amount })),
      },
      cashAccounts,
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Cashflow Statement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Direct method — built from posted journal entries hitting cash accounts, classified into Operating,
            Investing and Financing activities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={preset} onValueChange={(v) => handlePreset(v as PeriodPreset)}>
            <TabsList>
              <TabsTrigger value="mtd">MTD</TabsTrigger>
              <TabsTrigger value="qtd">QTD</TabsTrigger>
              <TabsTrigger value="ytd">YTD</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPreset("custom");
            }}
            className="h-9 w-40"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPreset("custom");
            }}
            className="h-9 w-40"
          />
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All Venues">All Venues</SelectItem>
              {CASHFLOW_VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileDown className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </header>

      <Card className="card-glass p-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          This statement reconciles to your Balance Sheet — closing cash here equals the sum of cash account balances at{" "}
          <span className="font-mono">{toDate}</span>. Click any line to drill into its source journal entries.
        </p>
      </Card>

      {/* The Statement */}
      <Card className="card-glass p-6 md:p-8">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold">KHAMBU Group</h2>
          <p className="text-sm text-muted-foreground">Statement of Cash Flows</p>
          <p className="text-xs text-muted-foreground mt-1">
            For the period from {fromDate} to {toDate}
            {venueFilter !== "All Venues" && <> — {venueFilter}</>}
          </p>
        </div>

        {loading ? (
          <div className="py-16 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted/30 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
            ))}
          </div>
        ) : (
          <div className="font-mono text-sm">
            {/* Opening */}
            <StatementRow
              label="Opening cash & cash equivalents"
              amount={opening}
              bold
              border="top-bottom"
            />

            {/* Sections */}
            {SECTION_ORDER.map((sec) => {
              const items = linesBySection[sec];
              return (
                <div key={sec} className="mt-5">
                  <div className="font-sans font-semibold uppercase text-xs tracking-wider text-muted-foreground mb-2">
                    {SECTION_LABELS[sec]}
                  </div>
                  {items.length === 0 && (
                    <div className="text-xs text-muted-foreground italic ml-4 mb-2">No activity</div>
                  )}
                  {items.map((line) => {
                    const key = `${line.section}|${line.lineItem}`;
                    const isOpen = !!openSection[key];
                    return (
                      <Collapsible
                        key={key}
                        open={isOpen}
                        onOpenChange={(o) => setOpenSection((s) => ({ ...s, [key]: o }))}
                      >
                        <CollapsibleTrigger className="w-full grid grid-cols-[1fr_auto] items-center py-1.5 px-2 -mx-2 rounded hover:bg-muted/40 transition-colors text-left">
                          <div className="flex items-center gap-1.5 ml-4">
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                            />
                            <span className="font-sans">{line.lineItem}</span>
                          </div>
                          <span className={`tabular-nums ${line.amount < 0 ? "text-destructive" : ""}`}>
                            {fmt(line.amount)}
                          </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-10 my-1 border-l-2 border-border/60 pl-3 max-h-[280px] overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="text-xs">
                                  <TableHead className="h-7">Date</TableHead>
                                  <TableHead className="h-7">Account</TableHead>
                                  <TableHead className="h-7">Memo</TableHead>
                                  <TableHead className="h-7">Venue</TableHead>
                                  <TableHead className="h-7 text-right">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {line.details
                                  .slice()
                                  .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
                                  .map((d, i) => (
                                    <TableRow key={i} className="text-xs">
                                      <TableCell className="py-1 font-mono">{d.entry_date}</TableCell>
                                      <TableCell className="py-1">
                                        <span className="font-mono text-muted-foreground">{d.account_code}</span>{" "}
                                        {d.account_name}
                                      </TableCell>
                                      <TableCell className="py-1 font-sans">{d.memo}</TableCell>
                                      <TableCell className="py-1">{d.venue || "—"}</TableCell>
                                      <TableCell
                                        className={`py-1 text-right tabular-nums ${d.amount < 0 ? "text-destructive" : ""}`}
                                      >
                                        {fmt(d.amount)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                  <StatementRow
                    label={`Net cash ${sectionTotals[sec] >= 0 ? "from" : "used in"} ${sec} activities`}
                    amount={sectionTotals[sec]}
                    indent
                    italic
                    border="top"
                  />
                </div>
              );
            })}

            {/* Net change + closing */}
            <div className="mt-6">
              <StatementRow
                label="Net increase / (decrease) in cash"
                amount={netChange}
                bold
                border="top"
              />
              <StatementRow label="Opening cash & cash equivalents" amount={opening} />
              <StatementRow
                label="Closing cash & cash equivalents"
                amount={closing}
                bold
                border="double"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Reconciliation + cash balances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-glass p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Reconciliation to Balance Sheet</h3>
            {reconciles ? (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <CheckCircle2 className="h-4 w-4" /> Reconciles
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-4 w-4" /> Mismatch {fmtMoney(reconciliationDelta)}
              </span>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Closing per statement</span>
              <span className="tabular-nums">{fmt(closing)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash account balances at {toDate}</span>
              <span className="tabular-nums">{fmt(cashBalanceTotal)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1 font-semibold">
              <span>Difference</span>
              <span className={`tabular-nums ${reconciles ? "" : "text-destructive"}`}>
                {fmt(reconciliationDelta)}
              </span>
            </div>
          </div>
        </Card>

        <Card className="card-glass p-4">
          <h3 className="text-sm font-semibold mb-3">Closing cash balances by account</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashAccounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-3">
                    No cash accounts
                  </TableCell>
                </TableRow>
              )}
              {cashAccounts.map((a) => (
                <TableRow key={a.code}>
                  <TableCell className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(a.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {unclassified.length > 0 && (
        <Card className="card-glass p-4 border-warning/40">
          <h3 className="text-sm font-semibold mb-2 text-warning">
            Unclassified cash movements ({unclassified.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            These cash entries have no counter-account on their journal — review them in the Journal.
          </p>
          <div className="max-h-[260px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unclassified.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{d.entry_date}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono text-muted-foreground">{d.account_code}</span> {d.account_name}
                    </TableCell>
                    <TableCell className="text-sm">{d.memo}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(d.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatementRow({
  label,
  amount,
  bold,
  italic,
  indent,
  border,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  italic?: boolean;
  indent?: boolean;
  border?: "top" | "top-bottom" | "double";
}) {
  const borderCls =
    border === "double"
      ? "border-t-2 border-double border-foreground/60"
      : border === "top-bottom"
        ? "border-y border-border"
        : border === "top"
          ? "border-t border-border"
          : "";
  return (
    <div className={`grid grid-cols-[1fr_auto] py-1.5 px-2 ${borderCls}`}>
      <span
        className={`font-sans ${indent ? "ml-8" : ""} ${bold ? "font-semibold" : ""} ${italic ? "italic" : ""}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? "font-semibold" : ""} ${amount < 0 ? "text-destructive" : ""}`}
      >
        {fmt(amount)}
      </span>
    </div>
  );
}
