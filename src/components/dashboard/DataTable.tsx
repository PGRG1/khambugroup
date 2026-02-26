import { useState, useMemo } from "react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SalesDetailModal } from "./SalesDetailModal";

interface DataTableProps {
  data: SalesRecord[];
  onUpdate?: (index: number, record: SalesRecord) => void;
  onDelete?: (index: number) => void;
}

type SortKey = keyof SalesRecord;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 15;

const DataTable = ({ data, onUpdate, onDelete }: DataTableProps) => {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<"All" | "Assembly" | "Caliente" | "Hanabi">("All");
  const [detailRecord, setDetailRecord] = useState<SalesRecord | null>(null);

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
    result.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [data, venueFilter, searchQuery, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE);
  const pageData = filteredAndSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const getOriginalIndex = (filteredRecord: SalesRecord) => {
    return data.findIndex(r => r.date === filteredRecord.date && r.venue === filteredRecord.venue && r.reportNumber === filteredRecord.reportNumber);
  };

  const downloadCSV = () => {
    const headers = ["Date","Day","Venue","Report #","Orders","Guests","Subtotal","Service Charge","Discount","Total Sales","VISA","Mastercard","AMEX","Union Pay","Alipay","WeChat","Cash","Card Tips"];
    const sanitize = (v: string | number) => {
      if (typeof v === "number") return String(v);
      const s = String(v);
      if (/^[=+@\t\r]/.test(s)) return `'${s}`;
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = data.map(r => {
      const standardized = { ...r, discount: -Math.abs(r.discount) };
      return [standardized.date,standardized.day,standardized.venue,standardized.reportNumber,standardized.orders,standardized.guests,standardized.subtotal,standardized.serviceCharge,standardized.discount,standardized.totalSales,standardized.visa,standardized.mastercard,standardized.amex,standardized.unionPay,standardized.alipay,standardized.wechat,standardized.cash,standardized.cardTips].map(sanitize).join(",");
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
    <div className="card-glass rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-sm font-display font-semibold text-foreground">
          Sales Data ({filteredAndSorted.length}{filteredAndSorted.length !== data.length ? ` of ${data.length}` : ""} records)
        </h3>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search date, day, venue, report #..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["All", "Assembly", "Caliente", "Hanabi"] as const).map(v => (
            <button
              key={v}
              onClick={() => { setVenueFilter(v); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                venueFilter === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {v === "All" ? "All Venues" : v}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {([
                ["date", "Date"], ["day", "Day"], ["venue", "Venue"], ["reportNumber", "Report #"],
                ["orders", "Orders"], ["guests", "Guests"], ["subtotal", "Subtotal"],
                ["serviceCharge", "Svc Chg"], ["discount", "Discount"], ["totalSales", "Total"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <TableHead key={key} className="text-xs">
                  <button onClick={() => toggleSort(key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    {label} <SortIcon col={key} />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row) => (
              <TableRow key={`${row.date}-${row.venue}-${row.reportNumber}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailRecord(row)}>
                <TableCell className="text-xs">{row.date}</TableCell>
                <TableCell className="text-xs">{row.day}</TableCell>
                <TableCell className="text-xs">{row.venue}</TableCell>
                <TableCell className="text-xs">{row.reportNumber}</TableCell>
                <TableCell>{numCell("orders", row)}</TableCell>
                <TableCell>{numCell("guests", row)}</TableCell>
                <TableCell>{numCell("subtotal", row)}</TableCell>
                <TableCell>{numCell("serviceCharge", row)}</TableCell>
                <TableCell>{numCell("discount", row)}</TableCell>
                <TableCell>{numCell("totalSales", row)}</TableCell>
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
