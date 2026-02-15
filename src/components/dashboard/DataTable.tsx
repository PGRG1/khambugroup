import { useState, useMemo } from "react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Trash2, Pencil, Download, X, Check, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { Input } from "@/components/ui/input";

interface DataTableProps {
  data: SalesRecord[];
  onUpdate?: (index: number, record: SalesRecord) => void;
  onDelete?: (index: number) => void;
}

type SortKey = keyof SalesRecord;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 15;

const DataTable = ({ data, onUpdate, onDelete }: DataTableProps) => {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRecord, setEditRecord] = useState<SalesRecord | null>(null);
  const [page, setPage] = useState(0);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState<"All" | "Assembly" | "Caliente">("All");

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
    // venue filter
    if (venueFilter !== "All") {
      result = result.filter(r => r.venue === venueFilter);
    }
    // search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.date.toLowerCase().includes(q) ||
        r.day.toLowerCase().includes(q) ||
        r.venue.toLowerCase().includes(q) ||
        r.reportNumber.toLowerCase().includes(q)
      );
    }
    // sort
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

  // For edit/delete we need the original data index
  const getOriginalIndex = (filteredRecord: SalesRecord) => {
    return data.findIndex(r => r.date === filteredRecord.date && r.venue === filteredRecord.venue && r.reportNumber === filteredRecord.reportNumber);
  };

  const startEdit = (record: SalesRecord) => {
    const idx = getOriginalIndex(record);
    setEditIdx(idx);
    setEditRecord({ ...record });
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setEditRecord(null);
  };

  const saveEdit = () => {
    if (editIdx !== null && editRecord && onUpdate) {
      onUpdate(editIdx, editRecord);
      cancelEdit();
    }
  };

  const setField = (key: keyof SalesRecord, value: string | number) => {
    if (!editRecord) return;
    setEditRecord({ ...editRecord, [key]: value });
  };

  const downloadCSV = () => {
    const headers = ["Date","Day","Venue","Report #","Orders","Guests","Subtotal","Service Charge","Discount","Total Sales","VISA","Mastercard","AMEX","Union Pay","Alipay","WeChat","Cash","Card Tips"];
    const sanitize = (v: string | number) => {
      const s = String(v);
      // CSV injection prevention: prefix formula chars with single quote
      if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = data.map(r => [r.date,r.day,r.venue,r.reportNumber,r.orders,r.guests,r.subtotal,r.serviceCharge,r.discount,r.totalSales,r.visa,r.mastercard,r.amex,r.unionPay,r.alipay,r.wechat,r.cash,r.cardTips].map(sanitize).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "khambu_sales_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const numCell = (key: keyof SalesRecord, row: SalesRecord, idx: number) => {
    if (editIdx === idx && editRecord) {
      return (
        <input
          type="number"
          value={editRecord[key] as number}
          onChange={(e) => setField(key, parseFloat(e.target.value) || 0)}
          className="w-20 px-1 py-0.5 text-xs rounded border border-border bg-background text-foreground"
        />
      );
    }
    return <span className="text-xs">{typeof row[key] === "number" ? formatCurrency(row[key] as number) : row[key]}</span>;
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
          {(["All", "Assembly", "Caliente"] as const).map(v => (
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
              <TableHead className="text-xs w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row) => {
              const origIdx = getOriginalIndex(row);
              const isEditing = editIdx === origIdx;
              return (
                <TableRow key={`${row.date}-${row.venue}-${row.reportNumber}`}>
                  <TableCell className="text-xs">
                    {isEditing && editRecord ? (
                      <input type="date" value={editRecord.date} onChange={(e) => setField("date", e.target.value)}
                        className="w-28 px-1 py-0.5 text-xs rounded border border-border bg-background text-foreground" />
                    ) : row.date}
                  </TableCell>
                  <TableCell className="text-xs">{row.day}</TableCell>
                  <TableCell className="text-xs">
                    {isEditing && editRecord ? (
                      <select value={editRecord.venue} onChange={(e) => setField("venue", e.target.value)}
                        className="px-1 py-0.5 text-xs rounded border border-border bg-background text-foreground">
                        <option>Assembly</option>
                        <option>Caliente</option>
                      </select>
                    ) : row.venue}
                  </TableCell>
                  <TableCell className="text-xs">{row.reportNumber}</TableCell>
                  <TableCell>{numCell("orders", row, origIdx)}</TableCell>
                  <TableCell>{numCell("guests", row, origIdx)}</TableCell>
                  <TableCell>{numCell("subtotal", row, origIdx)}</TableCell>
                  <TableCell>{numCell("serviceCharge", row, origIdx)}</TableCell>
                  <TableCell>{numCell("discount", row, origIdx)}</TableCell>
                  <TableCell>{numCell("totalSales", row, origIdx)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="p-1 rounded hover:bg-secondary text-primary"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={cancelEdit} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          {onUpdate && <button onClick={() => startEdit(row)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
                          {onDelete && <button onClick={() => setDeleteIdx(origIdx)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
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

      <DeleteConfirmDialog
        open={deleteIdx !== null}
        onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}
        onConfirm={() => {
          if (deleteIdx !== null && onDelete) {
            onDelete(deleteIdx);
            setDeleteIdx(null);
          }
        }}
        title="Delete Sales Record"
        description="Are you sure you want to delete this sales record? This action cannot be undone."
      />
    </div>
  );
};

export default DataTable;
