import { useState } from "react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Trash2, Pencil, Download, X, Check, ChevronLeft, ChevronRight } from "lucide-react";


interface DataTableProps {
  data: SalesRecord[];
  onUpdate: (index: number, record: SalesRecord) => void;
  onDelete: (index: number) => void;
}

const PAGE_SIZE = 15;

const DataTable = ({ data, onUpdate, onDelete }: DataTableProps) => {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRecord, setEditRecord] = useState<SalesRecord | null>(null);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const globalOffset = page * PAGE_SIZE;

  const startEdit = (idx: number) => {
    setEditIdx(idx);
    setEditRecord({ ...data[idx] });
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setEditRecord(null);
  };

  const saveEdit = () => {
    if (editIdx !== null && editRecord) {
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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-semibold text-foreground">Sales Data ({data.length} records)</h3>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Day</TableHead>
              <TableHead className="text-xs">Venue</TableHead>
              <TableHead className="text-xs">Report #</TableHead>
              <TableHead className="text-xs">Orders</TableHead>
              <TableHead className="text-xs">Guests</TableHead>
              <TableHead className="text-xs">Subtotal</TableHead>
              <TableHead className="text-xs">Svc Chg</TableHead>
              <TableHead className="text-xs">Discount</TableHead>
              <TableHead className="text-xs">Total</TableHead>
              <TableHead className="text-xs w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row, i) => {
              const globalIdx = globalOffset + i;
              const isEditing = editIdx === globalIdx;
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
                  <TableCell>{numCell("orders", row, globalIdx)}</TableCell>
                  <TableCell>{numCell("guests", row, globalIdx)}</TableCell>
                  <TableCell>{numCell("subtotal", row, globalIdx)}</TableCell>
                  <TableCell>{numCell("serviceCharge", row, globalIdx)}</TableCell>
                  <TableCell>{numCell("discount", row, globalIdx)}</TableCell>
                  <TableCell>{numCell("totalSales", row, globalIdx)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="p-1 rounded hover:bg-secondary text-primary"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={cancelEdit} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(globalIdx)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => onDelete(globalIdx)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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
    </div>
  );
};

export default DataTable;
