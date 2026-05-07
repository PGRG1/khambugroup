import { useState, useMemo, useCallback } from "react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Download, ArrowUpDown, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesDetailModal } from "./SalesDetailModal";
import ExcelFilterPopover from "./ExcelFilterPopover";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { DataTableShell, usePagination } from "@/components/common/data-table";

interface DataTableProps {
  data: SalesRecord[];
  onUpdate?: (index: number, record: SalesRecord) => void;
  onDelete?: (index: number) => void;
  onAttachReceipt?: (record: SalesRecord, file: File) => Promise<boolean>;
}

type SortKey = keyof SalesRecord;
type SortDir = "asc" | "desc";

const DataTable = ({ data, onUpdate, onDelete, onAttachReceipt }: DataTableProps) => {
  const [viewingReceipt, setViewingReceipt] = useState<SalesRecord | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<string>("All");
  const [detailRecord, setDetailRecord] = useState<SalesRecord | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
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
  }, []);

  const activeFilterCount = Object.keys(columnFilters).length;

  const filteredAndSorted = useMemo(() => {
    let result = [...data];
    if (venueFilter !== "All") result = result.filter(r => r.venue === venueFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.date.toLowerCase().includes(q) ||
        r.day.toLowerCase().includes(q) ||
        r.venue.toLowerCase().includes(q) ||
        r.reportNumber.toLowerCase().includes(q)
      );
    }
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

  const pg = usePagination(filteredAndSorted, 25);

  const getOriginalIndex = (filteredRecord: SalesRecord) =>
    data.findIndex(r => r.date === filteredRecord.date && r.venue === filteredRecord.venue && r.reportNumber === filteredRecord.reportNumber);

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
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
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
      <span className={`text-xs td-num ${isMismatchedTotal ? "text-destructive font-semibold" : ""}`}
        title={isMismatchedTotal ? `Expected: ${formatCurrency(row.subtotal + row.serviceCharge + row.discount)}` : undefined}>
        {typeof val === "number" ? formatCurrency(val) : val}
        {isMismatchedTotal && " ⚠"}
      </span>
    );
  };

  const venues = ["All", "Assembly", "Caliente", "Hanabi", "Events"];

  return (
    <>
      <DataTableShell
        search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Search date, venue, report #..." }}
        toolbarLeft={
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
            {activeFilterCount > 0 && (
              <button
                onClick={() => setColumnFilters({})}
                className="text-[11px] text-destructive hover:underline ml-2"
              >
                Clear {activeFilterCount} column filter{activeFilterCount > 1 ? "s" : ""}
              </button>
            )}
          </div>
        }
        resultCount={`${filteredAndSorted.length}${filteredAndSorted.length !== data.length ? ` of ${data.length}` : ""} records`}
        toolbarRight={
          <Button onClick={downloadCSV} size="sm" className="h-9 gap-2">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        }
        pagination={{
          page: pg.page,
          pageSize: pg.pageSize,
          totalPages: pg.totalPages,
          rangeStart: pg.rangeStart,
          rangeEnd: pg.rangeEnd,
          total: pg.total,
          onPageChange: pg.setPage,
          onPageSizeChange: pg.setPageSize,
        }}
      >
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
                  <TableHead key={key} className="text-xs">
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
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.pageItems.map((row) => (
              <TableRow key={`${row.date}-${row.venue}-${row.reportNumber}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailRecord(row)}>
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
            {pg.pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                  No records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DataTableShell>

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
        onAttachReceipt={onAttachReceipt ? async (record, file) => {
          const ok = await onAttachReceipt(record, file);
          if (ok) {
            const updated = data.find(r => r.date === record.date && r.venue === record.venue && r.reportNumber === record.reportNumber);
            if (updated) setDetailRecord(updated);
          }
        } : undefined}
      />

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
