import { useState, useMemo, useCallback } from "react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SalesDetailModal } from "./SalesDetailModal";
import ExcelFilterPopover from "./ExcelFilterPopover";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";

interface DataTableProps {
  data: SalesRecord[];
  onUpdate?: (index: number, record: SalesRecord) => void;
  onDelete?: (index: number) => void;
  onAttachReceipt?: (record: SalesRecord, file: File) => Promise<boolean>;
}

type SortKey = keyof SalesRecord;
type SortDir = "asc" | "desc";
const PAGE_SIZE = 15;

const DataTable = ({ data, onUpdate, onDelete }: DataTableProps) => {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<string>("All");
  const [detailRecord, setDetailRecord] = useState<SalesRecord | null>(null);
  // columnFilters: key → Set<string> of selected values. null entry = no filter.
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const uniqueValues = useCallback((key: SortKey) => {
    const vals = new Set<string>();
    data.forEach(r => vals.add(String(r[key])));
    return Array.from(vals).sort();
  }, [data]);

  const handleFilterChange = useCallback((col: string, values: Set<string> | null) => {
    setColumnFilters(prev => {
      if (values === null) {
        const { [col]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [col]: values };
    });
    setPage(0);
  }, []);

  const activeFilterCount = Object.keys(columnFilters).length;

  const filteredAndSorted = useMemo(() => {
    let result = [...data];
    if (venueFilter !== "All") {
      result = result.filter(r => r.venue === venueFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.date.toLowerCase().includes(q) ||
        r.day.toLowerCase().includes(q) ||
        r.venue.toLowerCase().includes(q) ||
        r.reportNumber.toLowerCase().includes(q)
      );
    }
    // Apply column filters (value-based)
    for (const [col, selectedValues] of Object.entries(columnFilters)) {
      result = result.filter(r => selectedValues.has(String(r[col as SortKey])));
    }
    result.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [data, venueFilter, searchQuery, sortKey, sortDir, columnFilters]);

  const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE);
  const pageData = filteredAndSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const getOriginalIndex = (filteredRecord: SalesRecord) => {
    return data.findIndex(r => r.date === filteredRecord.date && r.venue === filteredRecord.venue && r.reportNumber === filteredRecord.reportNumber);
  };

  const downloadCSV = () => {
    const headers = ["Date","Day","Venue","Report #","Orders","Guests","Subtotal","Service Charge","Discount","Total Sales","VISA","Mastercard","AMEX","Union Pay","JCB","Alipay","WeChat","PayMe","Cash","Card Tips"];
    const sanitize = (v: string | number) => {
      if (typeof v === "number") return String(v);
      const s = String(v);
      if (/^[=+@\t\r]/.test(s)) return `'${s}`;
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredAndSorted.map(r => {
      const standardized = { ...r, discount: -Math.abs(r.discount) };
      return [standardized.date,standardized.day,standardized.venue,standardized.reportNumber,standardized.orders,standardized.guests,standardized.subtotal,standardized.serviceCharge,standardized.discount,standardized.totalSales,standardized.visa,standardized.mastercard,standardized.amex,standardized.unionPay,standardized.jcb,standardized.alipay,standardized.wechat,standardized.payme,standardized.cash,standardized.cardTips].map(sanitize).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "khambu_sales_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasTotalMismatch = (row: SalesRecord) => {
    const expected = row.subtotal + row.serviceCharge + row.discount;
    return Math.abs(row.totalSales - expected) > 0.01;
  };

  const numCell = (key: keyof SalesRecord, row: SalesRecord) => {
    const val = row[key] as number;
    const isMismatchedTotal = key === "totalSales" && hasTotalMismatch(row);
    return (
      <span className={`text-xs ${isMismatchedTotal ? "text-destructive font-semibold" : ""}`}
        title={isMismatchedTotal ? `Expected: ${formatCurrency(row.subtotal + row.serviceCharge + row.discount)}` : undefined}>
        {typeof val === "number" ? formatCurrency(val) : val}
        {isMismatchedTotal && " ⚠"}
      </span>
    );
  };

  return (
    <div className="card-glass rounded-xl p-3 sm:p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <h3 className="text-xs sm:text-sm font-display font-semibold text-foreground">
          Sales Data ({filteredAndSorted.length}{filteredAndSorted.length !== data.length ? ` of ${data.length}` : ""})
        </h3>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="relative w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["All", "Assembly", "Caliente", "Hanabi", "Events"]).map(v => (
            <button
              key={v}
              onClick={() => { setVenueFilter(v); setPage(0); }}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-lg border transition-colors ${
                venueFilter === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {v === "All" ? "All" : v}
            </button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-muted-foreground">{activeFilterCount} column filter{activeFilterCount > 1 ? "s" : ""} active</span>
          <button onClick={() => { setColumnFilters({}); setPage(0); }} className="text-[10px] text-destructive hover:underline">Clear all</button>
        </div>
      )}

      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow>
              {([
                ["date", "Date"], ["day", "Day"], ["venue", "Venue"],
                ["orders", "Ord"], ["guests", "Gst"], ["subtotal", "Subtotal"],
                ["serviceCharge", "Svc"], ["discount", "Disc"], ["totalSales", "Total"],
              ] as [SortKey, string][]).map(([key, label]) => {
                const isDate = key === "date";
                return (
                  <TableHead key={key} className="text-[10px] sm:text-xs px-1.5 sm:px-4">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => toggleSort(key)} className="flex items-center gap-0.5 hover:text-foreground transition-colors whitespace-nowrap">
                        {label} <SortIcon col={key} />
                      </button>
                      <ExcelFilterPopover
                        columnKey={key}
                        label={label}
                        values={uniqueValues(key)}
                        selectedValues={columnFilters[key] ?? null}
                        onFilterChange={handleFilterChange}
                        isDate={isDate}
                      />
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row) => (
              <TableRow key={`${row.date}-${row.venue}-${row.reportNumber}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailRecord(row)}>
                <TableCell className="text-[10px] sm:text-xs px-1.5 sm:px-4 whitespace-nowrap">{row.date}</TableCell>
                <TableCell className="text-[10px] sm:text-xs px-1.5 sm:px-4">{row.day}</TableCell>
                <TableCell className="text-[10px] sm:text-xs px-1.5 sm:px-4">{row.venue}</TableCell>
                <TableCell className="px-1.5 sm:px-4">{numCell("orders", row)}</TableCell>
                <TableCell className="px-1.5 sm:px-4">{numCell("guests", row)}</TableCell>
                <TableCell className="px-1.5 sm:px-4">{numCell("subtotal", row)}</TableCell>
                <TableCell className="px-1.5 sm:px-4">{numCell("serviceCharge", row)}</TableCell>
                <TableCell className="px-1.5 sm:px-4">{numCell("discount", row)}</TableCell>
                <TableCell className="px-1.5 sm:px-4">{numCell("totalSales", row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="p-1 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <SalesDetailModal
        record={detailRecord}
        open={detailRecord !== null}
        onOpenChange={(open) => { if (!open) setDetailRecord(null); }}
        onEdit={onUpdate ? (record) => {
          const idx = getOriginalIndex(record);
          if (idx >= 0) onUpdate(idx, record);
          setDetailRecord(null);
        } : undefined}
        onDelete={onDelete ? (record) => {
          const idx = getOriginalIndex(record);
          if (idx >= 0) onDelete(idx);
          setDetailRecord(null);
        } : undefined}
      />
    </div>
  );
};

export default DataTable;
