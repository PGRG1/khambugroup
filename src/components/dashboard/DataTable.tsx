import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Download, ArrowUpDown, ArrowUp, ArrowDown, Eye, ChevronDown, ChevronRight, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExcelFilterPopover from "./ExcelFilterPopover";
import NumericRangeFilterPopover, { NumericRange } from "./NumericRangeFilterPopover";
import AccountingMappingSummary from "./AccountingMappingSummary";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { DataTableShell } from "@/components/common/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUnmappedVenues } from "@/hooks/useUnmappedVenues";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import DateFilter from "./DateFilter";
import { toast } from "sonner";

interface DataTableProps {
  data: SalesRecord[];
}

type SortKey = keyof SalesRecord;
type SortDir = "asc" | "desc";

const NUMERIC_COLS: SortKey[] = ["orders", "guests", "subtotal", "serviceCharge", "discount", "totalSales"];
const CHECKBOX_FILTER_COLS: SortKey[] = ["day"];

// Safe YYYY-MM bucket. Falls back gracefully so bad rows don't disappear.
function safeMonthKey(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(0, 7);
  const d = new Date(date);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return "unknown";
}

function monthLabelSafe(key: string): string {
  if (key === "unknown") return "Unknown date";
  return getMonthLabel(key);
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DataTable = ({ data }: DataTableProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hydrated = useRef(false);

  // --- filter state -------------------------------------------------------
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<string>("All");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [checkboxFilters, setCheckboxFilters] = useState<Record<string, Set<string>>>({});
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericRange>>({});
  const [reconciliationOnly, setReconciliationOnly] = useState(false);

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set([currentMonthKey()]));
  const [viewingReceipt, setViewingReceipt] = useState<SalesRecord | null>(null);
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  // --- URL hydration (once) -----------------------------------------------
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const v = searchParams.get("venue"); if (v) setVenueFilter(v);
    const f = searchParams.get("from"); if (f) { const d = new Date(f); if (!isNaN(d.getTime())) setFrom(d); }
    const t = searchParams.get("to"); if (t) { const d = new Date(t); if (!isNaN(d.getTime())) setTo(d); }
    const q = searchParams.get("q"); if (q) setSearchQuery(q);
    const sk = searchParams.get("sort") as SortKey | null; if (sk) setSortKey(sk);
    const sd = searchParams.get("dir"); if (sd === "asc" || sd === "desc") setSortDir(sd);
    if (searchParams.get("recon") === "1") setReconciliationOnly(true);
    const nextCb: Record<string, Set<string>> = {};
    const nextNum: Record<string, NumericRange> = {};
    searchParams.forEach((val, key) => {
      if (key.startsWith("d_")) nextCb[key.slice(2)] = new Set(val.split("|").filter(Boolean));
      else if (key.startsWith("n_")) {
        const [lo, hi] = val.split(":");
        const r: NumericRange = {};
        if (lo !== "") r.min = Number(lo);
        if (hi !== "") r.max = Number(hi);
        if (r.min !== undefined || r.max !== undefined) nextNum[key.slice(2)] = r;
      }
    });
    if (Object.keys(nextCb).length) setCheckboxFilters(nextCb);
    if (Object.keys(nextNum).length) setNumericFilters(nextNum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- URL projection (state -> URL) --------------------------------------
  useEffect(() => {
    if (!hydrated.current) return;
    const next = new URLSearchParams();
    if (venueFilter !== "All") next.set("venue", venueFilter);
    if (from) next.set("from", from.toISOString().slice(0, 10));
    if (to) next.set("to", to.toISOString().slice(0, 10));
    if (searchQuery.trim()) next.set("q", searchQuery.trim());
    if (sortKey !== "date") next.set("sort", String(sortKey));
    if (sortDir !== "desc") next.set("dir", sortDir);
    if (reconciliationOnly) next.set("recon", "1");
    Object.entries(checkboxFilters).forEach(([k, s]) => {
      if (s.size > 0) next.set(`d_${k}`, Array.from(s).join("|"));
    });
    Object.entries(numericFilters).forEach(([k, r]) => {
      const lo = r.min !== undefined ? String(r.min) : "";
      const hi = r.max !== undefined ? String(r.max) : "";
      next.set(`n_${k}`, `${lo}:${hi}`);
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [venueFilter, from, to, searchQuery, sortKey, sortDir, reconciliationOnly, checkboxFilters, numericFilters, searchParams, setSearchParams]);

  // --- helpers -----------------------------------------------------------
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const hasTotalMismatch = useCallback((row: SalesRecord) => {
    const expected = row.subtotal + row.serviceCharge + row.discount;
    return Math.abs(row.totalSales - expected) > 0.01;
  }, []);

  // Apply every predicate except a specific one — used for filter option lists.
  const matches = useCallback((r: SalesRecord, exclude?: string): boolean => {
    if (exclude !== "venue" && venueFilter !== "All" && r.venue !== venueFilter) return false;
    if (exclude !== "date") {
      if (from) {
        const d = new Date(r.date);
        if (d < from) return false;
      }
      if (to) {
        const d = new Date(r.date);
        const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999);
        if (d > toEnd) return false;
      }
    }
    if (exclude !== "search" && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${r.date} ${r.day} ${r.venue} ${r.reportNumber}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (exclude !== "recon" && reconciliationOnly && !hasTotalMismatch(r)) return false;
    for (const [col, set] of Object.entries(checkboxFilters)) {
      if (exclude === col || set.size === 0) continue;
      if (!set.has(String(r[col as SortKey]))) return false;
    }
    for (const [col, range] of Object.entries(numericFilters)) {
      if (exclude === col) continue;
      const val = r[col as SortKey] as number;
      if (typeof val !== "number") continue;
      if (range.min !== undefined && val < range.min) return false;
      if (range.max !== undefined && val > range.max) return false;
    }
    return true;
  }, [venueFilter, from, to, searchQuery, reconciliationOnly, checkboxFilters, numericFilters, hasTotalMismatch]);

  const uniqueValues = useCallback((key: SortKey) => {
    const vals = new Set<string>();
    data.forEach(r => { if (matches(r, key)) vals.add(String(r[key])); });
    return Array.from(vals).sort();
  }, [data, matches]);

  const handleCheckboxFilter = useCallback((col: string, values: Set<string> | null) => {
    setCheckboxFilters(prev => {
      if (values === null || values.size === 0) {
        const { [col]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [col]: values };
    });
  }, []);

  const handleNumericFilter = useCallback((col: string, range: NumericRange | null) => {
    setNumericFilters(prev => {
      if (range === null) {
        const { [col]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [col]: range };
    });
  }, []);

  const filteredAndSorted = useMemo(() => {
    const result = data.filter(r => matches(r));
    result.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [data, matches, sortKey, sortDir]);

  // --- month grouping -----------------------------------------------------
  const grouped = useMemo(() => {
    const buckets = new Map<string, SalesRecord[]>();
    filteredAndSorted.forEach(r => {
      const k = safeMonthKey(r.date);
      const arr = buckets.get(k) ?? [];
      arr.push(r);
      buckets.set(k, arr);
    });
    // Sort months desc; "unknown" always last
    const keys = Array.from(buckets.keys()).sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return b.localeCompare(a);
    });
    return keys.map(k => ({ key: k, rows: buckets.get(k)! }));
  }, [filteredAndSorted]);

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // --- reconciliation banner ---------------------------------------------
  const mismatchCount = useMemo(
    () => data.filter(hasTotalMismatch).length,
    [data, hasTotalMismatch]
  );
  const { unmappedCount, unmappedVenues } = useUnmappedVenues();

  // --- clear all ----------------------------------------------------------
  const anyFilterActive =
    venueFilter !== "All" ||
    !!from || !!to ||
    searchQuery.trim().length > 0 ||
    Object.keys(checkboxFilters).length > 0 ||
    Object.keys(numericFilters).length > 0 ||
    reconciliationOnly;

  const clearAll = () => {
    setVenueFilter("All");
    setFrom(undefined); setTo(undefined);
    setSearchQuery("");
    setCheckboxFilters({});
    setNumericFilters({});
    setReconciliationOnly(false);
  };

  // --- month options for DateFilter --------------------------------------
  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") { setFrom(undefined); setTo(undefined); return; }
    if (period === "Custom") return;
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };

  // --- CSV ---------------------------------------------------------------
  const activeFilterSummary = (): string => {
    const bits: string[] = [];
    if (venueFilter !== "All") bits.push(venueFilter);
    if (from || to) bits.push(`${from ? from.toISOString().slice(0,10) : "…"} → ${to ? to.toISOString().slice(0,10) : "…"}`);
    if (searchQuery.trim()) bits.push(`"${searchQuery.trim()}"`);
    if (reconciliationOnly) bits.push("mismatched only");
    const nCount = Object.keys(numericFilters).length + Object.keys(checkboxFilters).length;
    if (nCount) bits.push(`${nCount} column filter${nCount > 1 ? "s" : ""}`);
    return bits.length ? bits.join(" · ") : "no filters";
  };

  const downloadCSV = () => {
    toast(`Exporting ${filteredAndSorted.length} record${filteredAndSorted.length === 1 ? "" : "s"}`, {
      description: activeFilterSummary(),
    });
    const headers = ["Date","Day","Venue","Report #","Orders","Guests","Subtotal","Service Charge","Discount","Total Sales","VISA","Mastercard","AMEX","Union Pay","JCB","Alipay","WeChat","PayMe","Cash","Card Tips"];
    const sanitize = (v: string | number) => {
      if (typeof v === "number") return String(v);
      const s = String(v);
      if (/^[=+@\t\r]/.test(s)) return `'${s}`;
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredAndSorted.map(r => {
      const s = { ...r, discount: -Math.abs(r.discount) };
      return [s.date,s.day,s.venue,s.reportNumber,s.orders,s.guests,s.subtotal,s.serviceCharge,s.discount,s.totalSales,s.visa,s.mastercard,s.amex,s.unionPay,s.jcb,s.alipay,s.wechat,s.payme,s.cash,s.cardTips].map(sanitize).join(",");
    });
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "khambu_sales_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- cell rendering ----------------------------------------------------
  const numCell = (key: keyof SalesRecord, row: SalesRecord) => {
    const val = row[key] as number;
    const isMismatchedTotal = key === "totalSales" && hasTotalMismatch(row);
    const isNegativeDiscount = key === "discount" && val < 0;
    const isZero = typeof val === "number" && val === 0;
    const cls = isMismatchedTotal
      ? "text-destructive font-semibold"
      : isNegativeDiscount
        ? "text-destructive"
        : isZero
          ? "text-muted-foreground"
          : "";
    return (
      <span className={`text-xs td-num ${cls}`}
        title={isMismatchedTotal ? `Expected: ${formatCurrency(row.subtotal + row.serviceCharge + row.discount)}` : undefined}>
        {typeof val === "number" ? formatCurrency(val) : val}
        {isMismatchedTotal && " ⚠"}
      </span>
    );
  };

  const sumField = (rows: SalesRecord[], key: keyof SalesRecord): number =>
    rows.reduce((s, r) => s + (r[key] as number), 0);

  const venues = ["All", "Assembly", "Caliente", "Hanabi", "Events"];

  // --- chips --------------------------------------------------------------
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (venueFilter !== "All") chips.push({ key: "venue", label: `Venue: ${venueFilter}`, onRemove: () => setVenueFilter("All") });
  if (from || to) {
    const l = `${from ? from.toISOString().slice(0,10) : "…"} → ${to ? to.toISOString().slice(0,10) : "…"}`;
    chips.push({ key: "date", label: l, onRemove: () => { setFrom(undefined); setTo(undefined); } });
  }
  if (searchQuery.trim()) chips.push({ key: "q", label: `Search: "${searchQuery.trim()}"`, onRemove: () => setSearchQuery("") });
  if (reconciliationOnly) chips.push({ key: "recon", label: "Reconciliation only", onRemove: () => setReconciliationOnly(false) });
  Object.entries(checkboxFilters).forEach(([col, set]) => {
    if (set.size > 0) chips.push({
      key: `d_${col}`,
      label: `${col}: ${set.size} value${set.size > 1 ? "s" : ""}`,
      onRemove: () => handleCheckboxFilter(col, null),
    });
  });
  Object.entries(numericFilters).forEach(([col, r]) => {
    const parts: string[] = [];
    if (r.min !== undefined) parts.push(`≥ ${r.min}`);
    if (r.max !== undefined) parts.push(`≤ ${r.max}`);
    chips.push({
      key: `n_${col}`,
      label: `${col}: ${parts.join(" ")}`,
      onRemove: () => handleNumericFilter(col, null),
    });
  });

  const { rows: allServicePeriods } = useVenueServicePeriods();
  const servicePeriodNameById = useMemo(() => {
    const m = new Map<string, string>();
    allServicePeriods.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [allServicePeriods]);

  const columns: [SortKey, string][] = [
    ["date", "Date"], ["day", "Day"], ["venue", "Venue"], ["servicePeriodId", "Period"],
    ["orders", "Ord"], ["guests", "Gst"], ["subtotal", "Subtotal"],
    ["serviceCharge", "Svc"], ["discount", "Disc"], ["totalSales", "Total"],
  ];

  return (
    <>
      {/* Reconciliation banner */}
      {(mismatchCount > 0 || unmappedCount > 0) && (
        <div className="flex items-stretch rounded-lg overflow-hidden border border-amber-500/40 bg-amber-500/5 mb-3">
          {mismatchCount > 0 && (
            <button
              type="button"
              onClick={() => setReconciliationOnly(true)}
              className="flex-1 flex items-center gap-2 px-4 py-2.5 text-left hover:bg-amber-500/10 transition-colors"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs">
                <strong className="text-amber-500">{mismatchCount}</strong> record{mismatchCount > 1 ? "s" : ""} with total mismatches — click to view
              </span>
            </button>
          )}
          {mismatchCount > 0 && unmappedCount > 0 && <div className="w-px bg-amber-500/30" />}
          {unmappedCount > 0 && (
            <button
              type="button"
              onClick={() => navigate("/finance/chart-of-accounts")}
              className="flex-1 flex items-center gap-2 px-4 py-2.5 text-left hover:bg-amber-500/10 transition-colors"
              title={unmappedVenues.join(", ")}
            >
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs">
                <strong className="text-amber-500">{unmappedCount}</strong> venue{unmappedCount > 1 ? "s" : ""} with unmapped revenue account{unmappedCount > 1 ? "s" : ""} — click to fix
              </span>
            </button>
          )}
        </div>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 mb-3">
          {chips.map(c => (
            <button
              key={c.key}
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              {c.label}
              <X className="h-2.5 w-2.5" />
            </button>
          ))}
          <button
            onClick={clearAll}
            className="text-[11px] text-destructive hover:underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      <DataTableShell
        search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Search date, venue, report #..." }}
        toolbarLeft={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {venues.map(v => (
                <button
                  key={v}
                  onClick={() => setVenueFilter(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    venueFilter === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <DateFilter
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              months={months.map(m => m.label)}
              onPeriodSelect={handlePeriodSelect}
            />
          </div>
        }
        resultCount={`${filteredAndSorted.length}${filteredAndSorted.length !== data.length ? ` of ${data.length}` : ""} records${anyFilterActive ? " (filtered)" : ""}`}
        toolbarRight={
          <>
            <button
              onClick={() => setShowMappingDialog(true)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
            >
              Mapping
            </button>
            <Button onClick={downloadCSV} size="sm" className="h-9 gap-2">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(([key, label]) => {
                const isNumeric = NUMERIC_COLS.includes(key);
                const isCheckbox = CHECKBOX_FILTER_COLS.includes(key);
                const isDate = key === "date";
                const hasFilter = isNumeric || isCheckbox || isDate;
                return (
                  <TableHead key={key} className="text-xs">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => toggleSort(key)} className="flex items-center gap-0.5 hover:text-foreground transition-colors whitespace-nowrap">
                        {label} <SortIcon col={key} />
                      </button>
                      {hasFilter && isNumeric && (
                        <NumericRangeFilterPopover
                          columnKey={key}
                          label={label}
                          range={numericFilters[key] ?? null}
                          onChange={handleNumericFilter}
                        />
                      )}
                      {hasFilter && (isCheckbox || isDate) && (
                        <ExcelFilterPopover
                          columnKey={key}
                          label={label}
                          values={uniqueValues(key)}
                          selectedValues={checkboxFilters[key] ?? null}
                          onFilterChange={handleCheckboxFilter}
                          isDate={isDate}
                        />
                      )}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                  No records found.
                </TableCell>
              </TableRow>
            )}
            {grouped.map(({ key, rows }) => {
              const expanded = expandedMonths.has(key);
              return (
                <React.Fragment key={key}>
                  <TableRow
                    className="bg-muted/40 hover:bg-muted/60 cursor-pointer border-t-2 border-border/60"
                    onClick={() => toggleMonth(key)}
                  >
                    <TableCell colSpan={3} className="text-xs font-semibold py-2">
                      <div className="flex items-center gap-2">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        <span>{monthLabelSafe(key)}</span>
                        <span className="text-muted-foreground font-normal">· {rows.length} record{rows.length > 1 ? "s" : ""}</span>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-xs td-num font-semibold">{formatCurrency(sumField(rows, "orders"))}</span></TableCell>
                    <TableCell><span className="text-xs td-num font-semibold">{formatCurrency(sumField(rows, "guests"))}</span></TableCell>
                    <TableCell><span className="text-xs td-num font-semibold">{formatCurrency(sumField(rows, "subtotal"))}</span></TableCell>
                    <TableCell><span className="text-xs td-num font-semibold">{formatCurrency(sumField(rows, "serviceCharge"))}</span></TableCell>
                    <TableCell><span className="text-xs td-num font-semibold">{formatCurrency(sumField(rows, "discount"))}</span></TableCell>
                    <TableCell><span className="text-xs td-num font-semibold">{formatCurrency(sumField(rows, "totalSales"))}</span></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {expanded && rows.map((row) => (
                    <TableRow
                      key={row.id ?? `${row.date}-${row.venue}-${row.reportNumber}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => { if (row.id) navigate(`/sales-data/${row.id}`); }}
                    >
                      <TableCell className="text-xs whitespace-nowrap">{row.date}</TableCell>
                      <TableCell className="text-xs">{row.day}</TableCell>
                      <TableCell className="text-xs">{row.venue}</TableCell>
                      <TableCell>{numCell("orders", row)}</TableCell>
                      <TableCell>{numCell("guests", row)}</TableCell>
                      <TableCell>{numCell("subtotal", row)}</TableCell>
                      <TableCell>{numCell("serviceCharge", row)}</TableCell>
                      <TableCell>{numCell("discount", row)}</TableCell>
                      <TableCell>{numCell("totalSales", row)}</TableCell>
                      <TableCell>
                        {row.receiptFileUrl ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingReceipt(row); }}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                            title="View receipt"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </DataTableShell>

      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Accounting Mapping</DialogTitle>
          </DialogHeader>
          <AccountingMappingSummary />
        </DialogContent>
      </Dialog>

      {viewingReceipt?.receiptFileUrl && (
        <AttachmentViewerDialog
          open={!!viewingReceipt}
          onOpenChange={(o) => { if (!o) setViewingReceipt(null); }}
          fileUrl={viewingReceipt.receiptFileUrl}
          title={`Receipt — ${viewingReceipt.venue} ${viewingReceipt.date}`}
          bucket="sales-receipts"
        />
      )}
    </>
  );
};

export default DataTable;
