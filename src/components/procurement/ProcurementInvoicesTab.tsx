import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Search, Trash2, ScanLine, Pencil, Eye, ArrowUpDown, ArrowUp, ArrowDown, X, Download } from "lucide-react";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import ProductAutocomplete from "@/components/invoices/ProductAutocomplete";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
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
  const { invoices, suppliers, loading, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, createSupplier } = useInvoiceData();
  const { user } = useAuth();

  const [productMaster, setProductMaster] = useState<any[]>([]);
  const normalizeSupplierName = (value: string) =>
    value.toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\b(limited|ltd|co|company)\b/g, " ").replace(/\s+/g, " ").trim();

  useEffect(() => {
    Promise.all([
      supabase.from("product_master" as any).select("id, internal_sku, internal_product_name, purchase_unit, stock_uom, stock_qty"),
      supabase.from("product_suppliers" as any).select("product_master_id, supplier, external_sku, supplier_product_name, purchase_unit_cost, purchase_unit"),
    ]).then(([pmRes, psRes]) => {
      const pm = (pmRes.data || []) as any[];
      const ps = (psRes.data || []) as any[];
      const entries: any[] = [];

      for (const p of pm) {
        const supplierEntries = ps.filter((s: any) => s.product_master_id === p.id);
        if (supplierEntries.length > 0) {
          for (const s of supplierEntries) {
            entries.push({
              id: p.id,
              internal_sku: p.internal_sku,
              external_sku: s.external_sku || "",
              internal_product_name: p.internal_product_name,
              supplier_product_name: s.supplier_product_name || "",
              purchase_unit_cost: s.purchase_unit_cost ?? 0,
              supplier: s.supplier || "",
              purchase_unit: s.purchase_unit || p.purchase_unit || "",
              stock_uom: p.stock_uom || "",
              stock_qty: p.stock_qty ?? 1,
            });
          }
        } else {
          entries.push({
            id: p.id,
            internal_sku: p.internal_sku,
            external_sku: "",
            internal_product_name: p.internal_product_name,
            supplier_product_name: "",
            purchase_unit_cost: 0,
            supplier: "",
            purchase_unit: p.purchase_unit || "",
            stock_uom: p.stock_uom || "",
            stock_qty: p.stock_qty ?? 1,
          });
        }
      }

      setProductMaster(entries);
    });
  }, []);

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Invoice>>({});
  const [editLines, setEditLines] = useState<InvoiceLineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const batchFileRef = useRef<{ size: number; url: string; name: string } | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const openAttachmentViewer = (fileUrl: string, invoiceNumber: string) => {
    setViewerFileUrl(fileUrl);
    setViewerTitle(`Invoice ${invoiceNumber}`);
    setViewerOpen(true);
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    const result = invoices.filter((inv) => {
      if (venueFilter !== "all" && inv.venue !== venueFilter) return false;
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q) || (inv.supplier_name || "").toLowerCase().includes(q);
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
      supplier_id: selectedInvoice.supplier_id,
      invoice_number: selectedInvoice.invoice_number,
      invoice_date: selectedInvoice.invoice_date,
      due_date: selectedInvoice.due_date,
      venue: selectedInvoice.venue,
      status: selectedInvoice.status,
      notes: selectedInvoice.notes,
    });
    setEditLines(lineItems.map((li) => ({ ...li })));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedInvoice) return;

    setSaving(true);
    const lineTotals = editLines.reduce((s, l) => s + l.total, 0);
    const lineTax = editLines.reduce((s, l) => s + l.tax_amount, 0);
    const success = await updateInvoice(
      selectedInvoice.id,
      {
        ...editForm,
        subtotal: lineTotals - lineTax,
        tax_amount: lineTax,
        total_amount: lineTotals,
      } as any,
      editLines.map(({ id, invoice_id, category_name, ...rest }) => rest)
    );
    setSaving(false);

    if (success) {
      setEditing(false);
      setDrawerOpen(false);
    }
  };

  const updateEditLine = (idx: number, field: string, value: any) => {
    setEditLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[idx], [field]: value };

      if (field === "quantity" || field === "unit_price" || field === "weight" || field === "discount") {
        const qty = field === "quantity" ? Number(value) : line.quantity;
        const price = field === "unit_price" ? Number(value) : line.unit_price;
        const weight = field === "weight" ? Number(value) : (line.weight || 0);
        const disc = field === "discount" ? Number(value) : (line.discount || 0);
        line.total = weight > 0 ? (weight * price) - disc + line.tax_amount : (qty * price) - disc + line.tax_amount;
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

  const editSupplierOptions = useMemo(() => {
    const pmNames = Array.from(
      new Set(
        productMaster
          .map((entry) => entry.supplier?.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim())
          .filter((name: string) => Boolean(name))
      )
    ).sort((a: string, b: string) => a.localeCompare(b));

    const options = (pmNames.length > 0 ? pmNames : suppliers.map((s) => s.name))
      .map((name: string) => {
        const norm = normalizeSupplierName(name);
        const match = suppliers.find((s) => normalizeSupplierName(s.name) === norm)
          ?? suppliers.find((s) => {
            const ns = normalizeSupplierName(s.name);
            return ns.includes(norm) || norm.includes(ns);
          });
        return { label: name, value: match?.id ?? `pm:${name}` };
      })
      .filter((opt, i, all) => all.findIndex((o) => o.label === opt.label) === i);

    // Ensure current edit supplier is in the list
    if (editForm.supplier_id && !options.some((o) => o.value === editForm.supplier_id)) {
      const cur = suppliers.find((s) => s.id === editForm.supplier_id);
      if (cur) options.unshift({ label: cur.name, value: cur.id });
    }

    return options;
  }, [productMaster, suppliers, editForm.supplier_id, normalizeSupplierName]);

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
              {
                ...inv,
                status: "pending",
                subtotal: lines.reduce((s, l) => s + l.total - l.tax_amount, 0),
                tax_amount: lines.reduce((s, l) => s + l.tax_amount, 0),
                total_amount: lines.reduce((s, l) => s + l.total, 0),
                entered_by: user?.id || "",
              },
              lines,
              fileUrl,
              fileName
            );
          }}
          onCreateSupplier={createSupplier}
          onClose={() => {
            setScannerOpen(false);
            batchFileRef.current = null;
          }}
          userId={user?.id || ""}
        />
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoice # or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadCSV(
            filtered.map((inv) => ({
              invoice_date: fmtDate(inv.invoice_date),
              invoice_number: inv.invoice_number,
              supplier_name: inv.supplier_name,
              venue: inv.venue,
              due_date: fmtDate(inv.due_date || ""),
              total_amount: Number(inv.total_amount).toFixed(2),
              status: inv.status,
            })),
            columns.map((c) => ({ key: c.key, label: c.label })),
            "invoices"
          )}
          className="h-9"
        >
          <Download className="h-4 w-4 mr-1" />Download
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {invoices.length} invoices · Total: <span className="font-semibold">${fmt(totalAmount)}</span>
      </p>

      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left px-3 py-2.5 font-semibold cursor-pointer select-none ${col.w} ${col.align === "right" ? "text-right" : ""}`}
                    onClick={() => toggleSort(col.key)}
                  >
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
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtForSupplier(Number(inv.total_amount), inv.supplier_name)}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {inv.file_url && (
                        <button onClick={(e) => { e.stopPropagation(); openAttachmentViewer(inv.file_url!, inv.invoice_number); }} className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground" title="View attachments">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setDeletingId(inv.id); setDeleteOpen(true); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
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

      <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (!o) setEditing(false); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedInvoice && !editing && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Invoice {selectedInvoice.invoice_number}
                  <Badge className={`text-[10px] ${STATUS_COLORS[selectedInvoice.status] || ""}`}>{selectedInvoice.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <Button size="sm" variant="outline" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit Invoice
                </Button>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{selectedInvoice.supplier_name}</span></div>
                  <div><span className="text-muted-foreground">Venue:</span> <span className="font-medium">{selectedInvoice.venue}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{fmtDate(selectedInvoice.invoice_date)}</span></div>
                  <div><span className="text-muted-foreground">Due:</span> <span className="font-medium">{fmtDate(selectedInvoice.due_date || "")}</span></div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">${fmtForSupplier(Number(selectedInvoice.total_amount), selectedInvoice.supplier_name)}</span></div>
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

          {selectedInvoice && editing && (
            <>
              <SheetHeader>
                <SheetTitle>Edit Invoice</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Supplier</Label>
                    <Select value={editForm.supplier_id || ""} onValueChange={async (v) => {
                      if (v.startsWith("pm:")) {
                        const supplierName = v.slice(3);
                        const created = await createSupplier({ name: supplierName, contact_person: null, email: null, phone: null, address: null, notes: null, payment_terms: "COD", is_active: true });
                        if (created?.id) setEditForm((f) => ({ ...f, supplier_id: created.id }));
                      } else {
                        setEditForm((f) => ({ ...f, supplier_id: v }));
                      }
                    }}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {editSupplierOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Invoice #</Label>
                    <Input value={editForm.invoice_number || ""} onChange={(e) => setEditForm((f) => ({ ...f, invoice_number: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Venue</Label>
                    <Select value={editForm.venue || ""} onValueChange={(v) => setEditForm((f) => ({ ...f, venue: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Assembly">Assembly</SelectItem>
                        <SelectItem value="Caliente">Caliente</SelectItem>
                        <SelectItem value="Hanabi">Hanabi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Invoice Date</Label>
                    <Input type="date" value={editForm.invoice_date || ""} onChange={(e) => setEditForm((f) => ({ ...f, invoice_date: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Due Date</Label>
                    <Input type="date" value={editForm.due_date || ""} onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={editForm.status || ""} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[60px]" />
                </div>

                <h4 className="text-sm font-semibold pt-2">Line Items ({editLines.length})</h4>
                <div className="space-y-2">
                  {editLines.map((li, i) => (
                    <div key={li.id || i} className="border border-border/50 rounded-lg p-2 space-y-1.5 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <div className="w-[80px] shrink-0">
                          <ProductAutocomplete
                            value={li.item_code || ""}
                            onChange={(v) => updateEditLine(i, "item_code", v)}
                            onSelect={(p) => {
                              setEditLines((prev) => {
                                const updated = [...prev];
                                updated[i] = { ...updated[i], item_code: p.external_sku || "", description: p.supplier_product_name || p.internal_product_name };
                                return updated;
                              });
                            }}
                            products={productMaster}
                            searchField="code"
                            placeholder="Code"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex-1">
                          <ProductAutocomplete
                            value={li.description}
                            onChange={(v) => updateEditLine(i, "description", v)}
                            onSelect={(p) => {
                              setEditLines((prev) => {
                                const updated = [...prev];
                                updated[i] = { ...updated[i], item_code: p.external_sku || "", description: p.supplier_product_name || p.internal_product_name };
                                return updated;
                              });
                            }}
                            products={productMaster}
                            searchField="name"
                            placeholder="Description"
                            className="h-7 text-xs"
                          />
                        </div>
                        <button onClick={() => setEditLines((prev) => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qty</Label>
                          <Input type="number" value={li.quantity} onChange={(e) => updateEditLine(i, "quantity", Number(e.target.value))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                          <Input type="number" step="0.01" value={li.unit_price} onChange={(e) => updateEditLine(i, "unit_price", Number(e.target.value))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Discount</Label>
                          <Input type="number" step="0.01" value={li.discount || 0} onChange={(e) => updateEditLine(i, "discount", Number(e.target.value))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Tax</Label>
                          <Input type="number" step="0.01" value={li.tax_amount} onChange={(e) => updateEditLine(i, "tax_amount", Number(e.target.value))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Total</Label>
                          <Input type="number" step="0.01" value={li.total} readOnly className="h-7 text-xs bg-muted/50" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm font-semibold">
                    Total: ${fmt(editLines.reduce((s, l) => s + l.total, 0))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="flex-1">
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
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
