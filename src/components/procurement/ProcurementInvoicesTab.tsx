import React, { useState, useMemo, useRef, useEffect } from "react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Search, Trash2, ScanLine, Pencil, Eye, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Plus, X, Download } from "lucide-react";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadCSV } from "@/utils/csvDownload";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  partial: "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRound = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtForSupplier = (n: number, supplierName?: string) => {
  if (supplierName && supplierName.toLowerCase().includes("beverage world")) return fmtRound(n);
  return fmt(n);
};
const fmtDate = (d: string) => {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function ProcurementInvoicesTab() {
  const { invoices, suppliers, loading, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, createSupplier, fetchAll } = useInvoiceData();
  const { user } = useAuth();

  // Fetch product master for AI matching during OCR
  const [productMaster, setProductMaster] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("product_master" as any).select("id, internal_sku, external_sku, internal_product_name, supplier_product_name, purchase_unit_cost")
      .then(({ data }) => { if (data) setProductMaster(data as any[]); });
  }, []);

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Detail drawer
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Invoice>>({});
  const [editLines, setEditLines] = useState<InvoiceLineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const batchFileRef = useRef<{ size: number; url: string; name: string } | null>(null);

  // Attachment viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const openAttachmentViewer = (fileUrl: string, invoiceNumber: string) => {
    setViewerFileUrl(fileUrl);
    setViewerTitle(`Invoice ${invoiceNumber}`);
    setViewerOpen(true);
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    let result = invoices.filter(inv => {
      if (venueFilter !== "all" && inv.venue !== venueFilter) return false;
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return inv.invoice_number.toLowerCase().includes(q) || (inv.supplier_name || "").toLowerCase().includes(q);
      }
      return true;
    });
    result.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [invoices, venueFilter, statusFilter, search, sortKey, sortDir]);

  const openDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    const items = await fetchLineItems(inv.id);
    setLineItems(items);
    setEditing(false);
    setDrawerOpen(true);
  };

  const startEditing = () => {
    if (!selectedInvoice) return;
    setEditForm({
      invoice_number: selectedInvoice.invoice_number,
      invoice_date: selectedInvoice.invoice_date,
      due_date: selectedInvoice.due_date,
      venue: selectedInvoice.venue,
      status: selectedInvoice.status,
      notes: selectedInvoice.notes,
    });
    setEditLines(lineItems.map(li => ({ ...li })));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedInvoice) return;
    setSaving(true);
    const lineTotals = editLines.reduce((s, l) => s + l.total, 0);
    const lineTax = editLines.reduce((s, l) => s + l.tax_amount, 0);
    const success = await updateInvoice(selectedInvoice.id, {
      ...editForm,
      subtotal: lineTotals - lineTax,
      tax_amount: lineTax,
      total_amount: lineTotals,
    } as any, editLines.map(({ id, invoice_id, category_name, ...rest }) => rest));
    setSaving(false);
    if (success) {
      setEditing(false);
      setDrawerOpen(false);
    }
  };

  const updateEditLine = (idx: number, field: string, value: any) => {
    setEditLines(prev => {
      const updated = [...prev];
      const line = { ...updated[idx], [field]: value };
      if (field === "quantity" || field === "unit_price" || field === "weight") {
        const qty = field === "quantity" ? Number(value) : line.quantity;
        const price = field === "unit_price" ? Number(value) : line.unit_price;
        const weight = field === "weight" ? Number(value) : (line.weight || 0);
        line.total = weight > 0 ? (weight * price) + line.tax_amount : (qty * price) + line.tax_amount;
      }
      updated[idx] = line;
      return updated;
    });
  };


  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteInvoice(deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
    setDrawerOpen(false);
  };

  const totalAmount = filtered.reduce((s, inv) => s + Number(inv.total_amount), 0);

  const columns = [
    { key: "invoice_date", label: "Date", w: "w-[100px]" },
    { key: "invoice_number", label: "Invoice #", w: "w-[120px]" },
    { key: "supplier_name", label: "Supplier", w: "min-w-[160px]" },
    { key: "venue", label: "Venue", w: "w-[90px]" },
    { key: "due_date", label: "Due Date", w: "w-[100px]" },
    { key: "total_amount", label: "Total", w: "w-[110px]", align: "right" as const },
    { key: "status", label: "Status", w: "w-[90px]" },
  ];

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading invoices...</div>;

  return (
    <div className="space-y-4">
      {/* Scanner */}
      {scannerOpen && (
        <InvoiceScanner
          suppliers={suppliers}
          productMaster={productMaster}
          onSave={async (inv, lines, files) => {
            let fileUrl: string | null = null;
            let fileName: string | null = null;
            if (files && files.length > 0) {
              const uploadedPaths: string[] = [];
              const fileNames: string[] = [];
              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.split(".").pop() || "pdf";
                const suffix = files.length > 1 ? `_page${i + 1}` : "";
                const storagePath = `${inv.invoice_date}/${inv.invoice_number.replace(/[^a-zA-Z0-9-_]/g, "_")}${suffix}.${ext}`;
                const { error: uploadErr } = await supabase.storage.from("invoice-files").upload(storagePath, file, { upsert: true });
                if (!uploadErr) {
                  uploadedPaths.push(storagePath);
                  fileNames.push(file.name);
                }
              }
              if (uploadedPaths.length > 0) {
                fileUrl = uploadedPaths.join(",");
                fileName = fileNames.join(", ");
              }
            }
            await createInvoice(
              { ...inv, status: "pending", subtotal: lines.reduce((s, l) => s + l.total - l.tax_amount, 0), tax_amount: lines.reduce((s, l) => s + l.tax_amount, 0), total_amount: lines.reduce((s, l) => s + l.total, 0), entered_by: user?.id || "" },
              lines, fileUrl, fileName
            );
          }}
          onCreateSupplier={createSupplier}
          onClose={() => { setScannerOpen(false); batchFileRef.current = null; }}
          userId={user?.id || ""}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoice # or supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Venues</SelectItem>
            <SelectItem value="Assembly">Assembly</SelectItem>
            <SelectItem value="Caliente">Caliente</SelectItem>
            <SelectItem value="Hanabi">Hanabi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[110px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setScannerOpen(true)} className="h-9">
          <ScanLine className="h-4 w-4 mr-1" />Upload Invoice
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadCSV(filtered.map(inv => ({
          invoice_date: fmtDate(inv.invoice_date),
          invoice_number: inv.invoice_number,
          supplier_name: inv.supplier_name,
          venue: inv.venue,
          due_date: fmtDate(inv.due_date || ""),
          total_amount: Number(inv.total_amount).toFixed(2),
          status: inv.status,
        })), columns.map(c => ({ key: c.key, label: c.label })), "invoices")} className="h-9">
          <Download className="h-4 w-4 mr-1" />Download
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {invoices.length} invoices · Total: <span className="font-semibold">${fmt(totalAmount)}</span>
      </p>

      {/* Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                {columns.map(col => (
                  <th key={col.key} className={`text-left px-3 py-2.5 font-semibold cursor-pointer select-none ${col.w} ${col.align === "right" ? "text-right" : ""}`} onClick={() => toggleSort(col.key)}>
                    <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                  </th>
                ))}
                <th className="px-3 py-2.5 w-[90px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground">No invoices found. Upload your first invoice above.</td></tr>
              ) : filtered.map((inv, idx) => (
                <tr key={inv.id} className={`border-b border-border/40 hover:bg-accent/30 transition-colors cursor-pointer ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`} onClick={() => openDetail(inv)}>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                  <td className="px-3 py-2 font-mono font-medium text-primary">{inv.invoice_number}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{inv.supplier_name}</td>
                  <td className="px-3 py-2">{inv.venue}</td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(inv.due_date || "")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(Number(inv.total_amount))}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {inv.file_url && (
                        <button onClick={e => { e.stopPropagation(); openAttachmentViewer(inv.file_url!, inv.invoice_number); }} className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground" title="View attachments">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); setDeletingId(inv.id); setDeleteOpen(true); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold text-[12px]">
                  <td colSpan={5} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(totalAmount)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Invoice {selectedInvoice.invoice_number}
                  <Badge className={`text-[10px] ${STATUS_COLORS[selectedInvoice.status] || ""}`}>{selectedInvoice.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{selectedInvoice.supplier_name}</span></div>
                  <div><span className="text-muted-foreground">Venue:</span> <span className="font-medium">{selectedInvoice.venue}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{fmtDate(selectedInvoice.invoice_date)}</span></div>
                  <div><span className="text-muted-foreground">Due:</span> <span className="font-medium">{fmtDate(selectedInvoice.due_date || "")}</span></div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">${fmt(Number(selectedInvoice.total_amount))}</span></div>
                  <div><span className="text-muted-foreground">ID:</span> <span className="font-mono text-xs text-muted-foreground">{selectedInvoice.id.slice(0, 8)}</span></div>
                </div>

                {selectedInvoice.file_url && (
                  <Button variant="outline" size="sm" onClick={() => openAttachmentViewer(selectedInvoice.file_url!, selectedInvoice.invoice_number)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View Attachments ({selectedInvoice.file_url.split(",").length} {selectedInvoice.file_url.split(",").length === 1 ? "page" : "pages"})
                  </Button>
                )}

                {selectedInvoice.notes && (
                  <div className="text-sm"><span className="text-muted-foreground">Notes:</span> {selectedInvoice.notes}</div>
                )}

                <h4 className="text-sm font-semibold pt-2">Line Items ({lineItems.length})</h4>
                <div className="space-y-1">
                  {lineItems.map((li, i) => (
                    <div key={li.id} className={`text-xs grid grid-cols-[1fr_60px_80px_80px] gap-2 px-2 py-1.5 rounded ${i % 2 === 0 ? "bg-muted/30" : ""}`}>
                      <div>
                        <span className="font-medium">{li.description}</span>
                        {li.pack_size && <span className="text-muted-foreground ml-1">[{li.pack_size}]</span>}
                      </div>
                      <div className="text-right tabular-nums">{li.quantity}</div>
                      <div className="text-right tabular-nums">{fmt(li.unit_price)}</div>
                      <div className="text-right tabular-nums font-medium">{fmt(li.total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Invoice" description="This will permanently delete this invoice and all its line items." />
      <AttachmentViewerDialog open={viewerOpen} onOpenChange={setViewerOpen} fileUrl={viewerFileUrl} title={viewerTitle} />
    </div>
  );
}
