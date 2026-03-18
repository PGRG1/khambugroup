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

  // Fetch product master + supplier pricing for AI matching during OCR
  const [productMaster, setProductMaster] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from("product_master" as any).select("id, internal_sku, internal_product_name"),
      supabase.from("product_suppliers" as any).select("product_master_id, supplier, external_sku, supplier_product_name, purchase_unit_cost"),
    ]).then(([pmRes, psRes]) => {
      const pm = (pmRes.data || []) as any[];
      const ps = (psRes.data || []) as any[];
      // Create flattened entries: one per product-supplier combo for matching
      const entries: any[] = [];
      for (const p of pm) {
        const supplierEntries = ps.filter((s: any) => s.product_master_id === p.id);
        if (supplierEntries.length > 0) {
          for (const s of supplierEntries) {
            entries.push({
              id: p.id,
              internal_sku: p.internal_sku,
              external_sku: s.external_sku || '',
              internal_product_name: p.internal_product_name,
              supplier_product_name: s.supplier_product_name || '',
              purchase_unit_cost: s.purchase_unit_cost ?? 0,
              supplier: s.supplier || '',
            });
          }
        } else {
          entries.push({ id: p.id, internal_sku: p.internal_sku, external_sku: '', internal_product_name: p.internal_product_name, supplier_product_name: '', purchase_unit_cost: 0, supplier: '' });
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
      supplier_id: selectedInvoice.supplier_id,
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
...
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Supplier</Label>
                    <Select value={editForm.supplier_id || ""} onValueChange={v => setEditForm(f => ({ ...f, supplier_id: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Invoice #</Label>
                    <Input value={editForm.invoice_number || ""} onChange={e => setEditForm(f => ({ ...f, invoice_number: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Venue</Label>
                    <Select value={editForm.venue || ""} onValueChange={v => setEditForm(f => ({ ...f, venue: v }))}>
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
                    <Input type="date" value={editForm.invoice_date || ""} onChange={e => setEditForm(f => ({ ...f, invoice_date: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Due Date</Label>
                    <Input type="date" value={editForm.due_date || ""} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={editForm.status || ""} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
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
                  <Textarea value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[60px]" />
                </div>

                <h4 className="text-sm font-semibold pt-2">Line Items ({editLines.length})</h4>
                <div className="space-y-2">
                  {editLines.map((li, i) => (
                    <div key={li.id || i} className="border border-border/50 rounded-lg p-2 space-y-1.5 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Input value={li.description} onChange={e => updateEditLine(i, "description", e.target.value)} className="h-7 text-xs flex-1" placeholder="Description" />
                        <button onClick={() => setEditLines(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qty</Label>
                          <Input type="number" value={li.quantity} onChange={e => updateEditLine(i, "quantity", Number(e.target.value))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                          <Input type="number" step="0.01" value={li.unit_price} onChange={e => updateEditLine(i, "unit_price", Number(e.target.value))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Tax</Label>
                          <Input type="number" step="0.01" value={li.tax_amount} onChange={e => updateEditLine(i, "tax_amount", Number(e.target.value))} className="h-7 text-xs" />
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
