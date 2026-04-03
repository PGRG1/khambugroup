import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import { useStandardProducts, StandardProduct } from "@/hooks/useStandardProducts";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Eye, Search, Trash2, ScanLine, Pencil, FileText, Download, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, BarChart3, Package, Link2, AlertTriangle } from "lucide-react";
import ProductAutocomplete from "@/components/invoices/ProductAutocomplete";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import InvoiceAnalytics from "@/components/invoices/InvoiceAnalytics";
import StandardProductsTab from "@/components/invoices/StandardProductsTab";
import SupplierItemMappingsTab from "@/components/invoices/SupplierItemMappingsTab";
import StandardProductDetailModal from "@/components/invoices/StandardProductDetailModal";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import LineItemsTab from "@/components/invoices/LineItemsTab";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  verified: "bg-indigo-100 text-indigo-800 border-indigo-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  partial: "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};

export default function Invoices() {
  const { invoices, suppliers, categories, loading, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus, createSupplier, createCategory, fetchAll } = useInvoiceData();
  const stdProducts = useStandardProducts();
  const { user } = useAuth();
  const { toast } = useToast();

  // Product Master data for edit dialog
  interface EditPMEntry {
    id: string;
    internal_sku: string;
    external_sku: string;
    internal_product_name: string;
    supplier_product_name: string;
    purchase_unit_cost?: number;
    supplier?: string;
    purchase_unit?: string;
    stock_uom?: string;
    stock_qty?: number;
  }
  const [editPMData, setEditPMData] = useState<EditPMEntry[]>([]);

  const loadProductMaster = useCallback(async () => {
    const { data: pmData } = await supabase.from("product_master" as any).select("id, internal_sku, external_sku, internal_product_name, supplier_product_name, purchase_unit_cost, supplier, purchase_unit, stock_uom, stock_qty");
    const { data: psData } = await supabase.from("product_suppliers").select("*");
    if (!pmData) { setEditPMData([]); return; }
    const entries: EditPMEntry[] = [];
    for (const pm of pmData as any[]) {
      const supplierEntries = (psData || []).filter((ps: any) => ps.product_master_id === pm.id);
      if (supplierEntries.length > 0) {
        for (const ps of supplierEntries) {
          entries.push({
            id: pm.id,
            internal_sku: pm.internal_sku,
            external_sku: ps.external_sku || pm.external_sku || "",
            internal_product_name: pm.internal_product_name,
            supplier_product_name: ps.supplier_product_name || pm.supplier_product_name || "",
            purchase_unit_cost: ps.purchase_unit_cost ?? pm.purchase_unit_cost,
            supplier: ps.supplier || pm.supplier || "",
            purchase_unit: ps.purchase_unit || pm.purchase_unit || "",
            stock_uom: ps.stock_uom || pm.stock_uom || "",
            stock_qty: ps.stock_qty ?? pm.stock_qty ?? 1,
          });
        }
      } else {
        entries.push(pm as EditPMEntry);
      }
    }
    setEditPMData(entries);
  }, []);

  // Standard Product detail modal state
  const [detailProduct, setDetailProduct] = useState<StandardProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Per-tab sort state
  const [auditSortKey, setAuditSortKey] = useState<string>("invoice_date");
  const [auditSortDir, setAuditSortDir] = useState<"asc" | "desc">("desc");
  const [supplierSortKey, setSupplierSortKey] = useState<string>("name");
  const [supplierSortDir, setSupplierSortDir] = useState<"asc" | "desc">("asc");
  const [categorySortKey, setCategorySortKey] = useState<string>("name");
  const [categorySortDir, setCategorySortDir] = useState<"asc" | "desc">("asc");

  // Attachment viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const makeToggleSort = (
    key: string,
    currentKey: string, setKey: (k: string) => void,
    currentDir: "asc" | "desc", setDir: (d: "asc" | "desc") => void
  ) => {
    if (currentKey === key) {
      setDir(currentDir === "asc" ? "desc" : "asc");
    } else {
      setKey(key);
      setDir("asc");
    }
  };

  const toggleSort = (key: string) => makeToggleSort(key, sortKey, setSortKey, sortDir, setSortDir);

  const SortIcon = ({ col, activeKey, activeDir }: { col: string; activeKey: string; activeDir: "asc" | "desc" }) => {
    if (activeKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return activeDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SortableHead = ({ col, label, activeKey, activeDir, onToggle, className }: { col: string; label: string; activeKey: string; activeDir: "asc" | "desc"; onToggle: (key: string) => void; className?: string }) => (
    <TableHead className={className}>
      <button onClick={() => onToggle(col)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label} <SortIcon col={col} activeKey={activeKey} activeDir={activeDir} />
      </button>
    </TableHead>
  );

  const sortData = <T,>(data: T[], key: string, dir: "asc" | "desc"): T[] => {
    return [...data].sort((a, b) => {
      const av = (a as any)[key];
      const bv = (b as any)[key];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
  };

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("invoices");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Track uploaded file URL to avoid re-uploading same file for multi-invoice batches
  const batchFileRef = useRef<{ size: number; url: string; name: string } | null>(null);

  // Audit documents filters
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditSupplier, setAuditSupplier] = useState("all");
  const [auditVenue, setAuditVenue] = useState("all");

  // Edit state
  interface EditLineItem {
    item_code: string; description: string; pack_size: string; quantity: string; unit: string; weight: string;
    unit_price: string; discount: string; tax_amount: string; total: string;
    matched_sku: string; matched_internal_name: string; matched_stock_uom: string;
    matched_purchase_uom: string; matched_stock_qty_ratio: number;
    product_master_id: string | null; price_changed?: boolean; pm_unit_price?: number; unmatched?: boolean;
  }
  const [editOpen, setEditOpen] = useState(false);
  const [editInv, setEditInv] = useState({ supplier_id: "", venue: "Assembly", invoice_number: "", invoice_date: "", due_date: "", notes: "", status: "pending" });
  const [editLines, setEditLines] = useState<EditLineItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New invoice form
  const [newInv, setNewInv] = useState({ supplier_id: "", venue: "Assembly", invoice_number: "", invoice_date: "", due_date: "", notes: "" });
  const [newLines, setNewLines] = useState<{ item_code: string; description: string; pack_size: string; quantity: string; unit: string; weight: string; unit_price: string; tax_amount: string }[]>([
    { item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" },
  ]);

  // Supplier form
  const [newSupplier, setNewSupplier] = useState({ name: "", contact_person: "", email: "", phone: "", address: "", notes: "", payment_terms: "COD" });
  // Category form
  const [newCatName, setNewCatName] = useState("");

  // Filter PM by supplier for edit
  const editSupplierName = useMemo(() => {
    return suppliers.find(s => s.id === editInv.supplier_id)?.name || "";
  }, [editInv.supplier_id, suppliers]);

  const normalizeSupplierName = (value: string) =>
    value.toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\b(limited|ltd|co|company)\b/g, " ").replace(/\s+/g, " ").trim();

  const editFilteredPM = useMemo(() => {
    if (!editPMData.length || !editSupplierName) return editPMData;
    const norm = normalizeSupplierName(editSupplierName);
    return [...editPMData].sort((a, b) => {
      const aMatch = a.supplier && (() => { const n = normalizeSupplierName(a.supplier!); return n === norm || n.includes(norm) || norm.includes(n); })() ? 0 : 1;
      const bMatch = b.supplier && (() => { const n = normalizeSupplierName(b.supplier!); return n === norm || n.includes(norm) || norm.includes(n); })() ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [editPMData, editSupplierName]);

  const filtered = useMemo(() => {
    let result = invoices.filter((inv) => {
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
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [invoices, venueFilter, statusFilter, search, sortKey, sortDir]);

  const openDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    const items = await fetchLineItems(inv.id);
    setLineItems(items);
    setDrawerOpen(true);
  };

  const openEdit = async (inv: Invoice) => {
    setEditingId(inv.id);
    setEditInv({
      supplier_id: inv.supplier_id,
      venue: inv.venue,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date || "",
      notes: inv.notes || "",
      status: inv.status,
    });
    // Load PM data
    await loadProductMaster();
    const items = await fetchLineItems(inv.id);
    // Resolve PM fields for each line
    const { data: pmAll } = await supabase.from("product_master" as any).select("id, internal_sku, external_sku, internal_product_name, supplier_product_name, purchase_unit_cost, supplier, purchase_unit, stock_uom, stock_qty");
    const { data: psAll } = await supabase.from("product_suppliers").select("*");
    setEditLines(items.map((li) => {
      let matched_sku = "";
      let matched_internal_name = "";
      let matched_stock_uom = "";
      let matched_purchase_uom = "";
      let matched_stock_qty_ratio = 1;
      let pm_unit_price: number | undefined;
      if (li.product_master_id && pmAll) {
        const pm = (pmAll as any[]).find(p => p.id === li.product_master_id);
        if (pm) {
          matched_sku = pm.internal_sku || "";
          matched_internal_name = pm.internal_product_name || "";
          // Try supplier-specific data
          const supplierName = suppliers.find(s => s.id === inv.supplier_id)?.name || "";
          const normSupplier = normalizeSupplierName(supplierName);
          const ps = (psAll || []).find((p: any) => p.product_master_id === pm.id && p.supplier && (
            normalizeSupplierName(p.supplier) === normSupplier || normalizeSupplierName(p.supplier).includes(normSupplier) || normSupplier.includes(normalizeSupplierName(p.supplier))
          ));
          matched_stock_uom = ps?.stock_uom || pm.stock_uom || "";
          matched_purchase_uom = ps?.purchase_unit || pm.purchase_unit || "";
          matched_stock_qty_ratio = ps?.stock_qty ?? pm.stock_qty ?? 1;
          pm_unit_price = ps?.purchase_unit_cost ?? pm.purchase_unit_cost;
        }
      }
      const qty = Number(li.quantity) || 0;
      const price = Number(li.unit_price) || 0;
      const disc = Number(li.discount) || 0;
      const tax = Number(li.tax_amount) || 0;
      const w = li.weight ? Number(li.weight) : null;
      const total = ((w ? w * price : qty * price) - disc + tax);
      const priceChanged = pm_unit_price != null && pm_unit_price > 0 && Math.abs(price - pm_unit_price) > 0.01;
      return {
        item_code: li.item_code || "",
        description: li.description,
        pack_size: li.pack_size || "",
        quantity: String(li.quantity),
        unit: li.unit || "",
        weight: li.weight ? String(li.weight) : "",
        unit_price: String(li.unit_price),
        discount: String(li.discount || 0),
        tax_amount: String(li.tax_amount),
        total: String(total.toFixed(2)),
        matched_sku,
        matched_internal_name,
        matched_stock_uom,
        matched_purchase_uom,
        matched_stock_qty_ratio,
        product_master_id: li.product_master_id || null,
        price_changed: priceChanged,
        pm_unit_price,
        unmatched: !li.product_master_id,
      };
    }));
    setDrawerOpen(false);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const lines = editLines.filter((l) => l.description.trim()).map((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unit_price) || 0;
      const disc = parseFloat(l.discount) || 0;
      const tax = parseFloat(l.tax_amount) || 0;
      const w = l.weight ? parseFloat(l.weight) : null;
      const lineTotal = parseFloat(((w ? w * price : qty * price) - disc + tax).toFixed(2));
      let pmId: string | null = l.product_master_id;
      if (!pmId && l.matched_sku && editPMData.length) {
        const pm = editPMData.find(p => p.internal_sku === l.matched_sku);
        if (pm) pmId = pm.id;
      }
      return { item_code: l.item_code || "", description: l.description, pack_size: l.pack_size || "", category_id: null, quantity: qty, unit: l.unit || null, weight: w, unit_price: price, discount: disc, tax_amount: tax, total: lineTotal, notes: null, product_master_id: pmId };
    });
    const subtotal = lines.reduce((s, l) => s + l.total - l.tax_amount, 0);
    const taxTotal = lines.reduce((s, l) => s + l.tax_amount, 0);

    const ok = await updateInvoice(editingId, {
      supplier_id: editInv.supplier_id,
      venue: editInv.venue,
      invoice_number: editInv.invoice_number,
      invoice_date: editInv.invoice_date,
      due_date: editInv.due_date || null,
      notes: editInv.notes || null,
      status: editInv.status,
      subtotal,
      tax_amount: taxTotal,
      total_amount: subtotal + taxTotal,
    }, lines);
    if (ok) setEditOpen(false);
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteInvoice(deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
    setDrawerOpen(false);
    setSelectedInvoice(null);
  };

  const handleCreateInvoice = async () => {
    const lines = newLines.filter((l) => l.description.trim()).map((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unit_price) || 0;
      const tax = parseFloat(l.tax_amount) || 0;
      const w = l.weight ? parseFloat(l.weight) : null;
      const lineTotal = w ? w * price + tax : qty * price + tax;
      return { item_code: l.item_code || "", description: l.description, pack_size: l.pack_size || "", category_id: null, quantity: qty, unit: l.unit || null, weight: w, unit_price: price, discount: 0, tax_amount: tax, total: lineTotal, notes: null, product_master_id: null };
    });
    const subtotal = lines.reduce((s, l) => s + l.total - l.tax_amount, 0);
    const taxTotal = lines.reduce((s, l) => s + l.tax_amount, 0);

    await createInvoice(
      { supplier_id: newInv.supplier_id, venue: newInv.venue, invoice_number: newInv.invoice_number, invoice_date: newInv.invoice_date, due_date: newInv.due_date || null, status: "pending", subtotal, tax_amount: taxTotal, total_amount: subtotal + taxTotal, notes: newInv.notes || null, entered_by: user?.id || "", discount: 0 },
      lines
    );
    setCreateOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewInv({ supplier_id: "", venue: "Assembly", invoice_number: "", invoice_date: "", due_date: "", notes: "" });
    setNewLines([{ item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" }]);
  };

  const addLine = () => setNewLines([...newLines, { item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" }]);
  const removeLine = (i: number) => setNewLines(newLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: string) => {
    const updated = [...newLines];
    (updated[i] as any)[field] = value;
    setNewLines(updated);
  };

  // Edit line helpers
  const emptyEditLine: EditLineItem = {
    item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "",
    unit_price: "0", discount: "0", tax_amount: "0", total: "0", matched_sku: "",
    matched_internal_name: "", matched_stock_uom: "", matched_purchase_uom: "", matched_stock_qty_ratio: 1,
    product_master_id: null, unmatched: true, price_changed: false,
  };
  const addEditLine = () => setEditLines([...editLines, { ...emptyEditLine }]);
  const removeEditLine = (i: number) => { if (editLines.length > 1) setEditLines(editLines.filter((_, idx) => idx !== i)); };
  const updateEditLine = (i: number, field: string, value: string) => {
    const updated = [...editLines];
    const line = { ...updated[i], [field]: value };
    if (["quantity", "weight", "unit_price", "discount", "tax_amount"].includes(field)) {
      const w = line.weight ? parseFloat(line.weight) : null;
      const price = parseFloat(line.unit_price) || 0;
      const qty = parseFloat(line.quantity) || 0;
      const disc = parseFloat(line.discount) || 0;
      const tax = parseFloat(line.tax_amount) || 0;
      line.total = String(((w ? w * price : qty * price) - disc + tax).toFixed(2));
    }
    updated[i] = line;
    setEditLines(updated);
  };

  const selectEditProduct = (i: number, product: EditPMEntry) => {
    const updated = [...editLines];
    const scannedPrice = parseFloat(updated[i].unit_price) || 0;
    const pmPrice = product.purchase_unit_cost ?? 0;
    const priceChanged = pmPrice > 0 && Math.abs(scannedPrice - pmPrice) > 0.01;
    updated[i] = {
      ...updated[i],
      item_code: product.external_sku || updated[i].item_code,
      description: product.supplier_product_name || product.internal_product_name || updated[i].description,
      matched_sku: product.internal_sku,
      matched_internal_name: product.internal_product_name || "",
      matched_stock_uom: product.stock_uom || "",
      matched_purchase_uom: product.purchase_unit || "",
      matched_stock_qty_ratio: product.stock_qty ?? 1,
      product_master_id: product.id,
      unmatched: false,
      price_changed: priceChanged,
      pm_unit_price: pmPrice > 0 ? pmPrice : undefined,
    };
    setEditLines(updated);
  };

  const handleCreateSupplier = async () => {
    await createSupplier({ name: newSupplier.name, contact_person: newSupplier.contact_person || null, email: newSupplier.email || null, phone: newSupplier.phone || null, address: newSupplier.address || null, notes: newSupplier.notes || null, payment_terms: newSupplier.payment_terms || "COD", is_active: true });
    setSupplierDialogOpen(false);
    setNewSupplier({ name: "", contact_person: "", email: "", phone: "", address: "", notes: "", payment_terms: "COD" });
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    await createCategory(newCatName.trim());
    setCategoryDialogOpen(false);
    setNewCatName("");
  };

  if (loading) return <div className="p-6"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold font-display">Invoices</h1>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setCategoryDialogOpen(true)}>+ Category</Button>
          <Button size="sm" variant="outline" onClick={() => setSupplierDialogOpen(true)}>+ Supplier</Button>
          <Button size="sm" variant="outline" onClick={() => setScannerOpen(true)}>
            <ScanLine className="h-4 w-4 mr-1" />Scan Invoice
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>
        </div>
      </div>

      {scannerOpen && (
        <InvoiceScanner
          suppliers={suppliers}
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
                const { error: uploadErr } = await supabase.storage
                  .from("invoice-files")
                  .upload(storagePath, file, { upsert: true });
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
              { ...inv, discount: inv.discount ?? 0, status: "pending", subtotal: lines.reduce((s, l) => s + l.total - l.tax_amount, 0), tax_amount: lines.reduce((s, l) => s + l.tax_amount, 0), total_amount: lines.reduce((s, l) => s + l.total, 0), entered_by: user?.id || "" },
              lines,
              fileUrl,
              fileName
            );
          }}
          
          onClose={() => { setScannerOpen(false); batchFileRef.current = null; }}
          userId={user?.id || ""}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="line-items"><FileText className="h-3 w-3 mr-1" />Line Items</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-3 w-3 mr-1" />Analytics</TabsTrigger>
          <TabsTrigger value="products"><Package className="h-3 w-3 mr-1" />Products</TabsTrigger>
          <TabsTrigger value="mappings"><Link2 className="h-3 w-3 mr-1" />Mappings</TabsTrigger>
          <TabsTrigger value="audit-docs">Audit Documents</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Venues</SelectItem>
                <SelectItem value="Assembly">Assembly</SelectItem>
                <SelectItem value="Caliente">Caliente</SelectItem>
                <SelectItem value="Hanabi">Hanabi</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing {filtered.length}{filtered.length !== invoices.length ? ` of ${invoices.length}` : ""} invoices
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead col="invoice_number" label="Invoice #" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} />
                  <SortableHead col="supplier_name" label="Supplier" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} />
                  <SortableHead col="venue" label="Venue" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} />
                  <SortableHead col="invoice_date" label="Date" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} />
                  <SortableHead col="due_date" label="Due" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} />
                  <SortableHead col="total_amount" label="Total" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} className="text-right" />
                  <SortableHead col="status" label="Status" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} />
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices found</TableCell></TableRow>
                ) : filtered.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => openDetail(inv)}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.supplier_name}</TableCell>
                    <TableCell>{inv.venue}</TableCell>
                    <TableCell>{inv.invoice_date}</TableCell>
                    <TableCell>{inv.due_date || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[inv.status] || ""}>{inv.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(inv); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); confirmDelete(inv.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="line-items">
          <LineItemsTab suppliers={suppliers} />
        </TabsContent>

        <TabsContent value="analytics">
          <InvoiceAnalytics invoices={invoices} />
        </TabsContent>

        <TabsContent value="products">
          <StandardProductsTab
            products={stdProducts.products}
            conversions={stdProducts.conversions}
            onCreateProduct={stdProducts.createProduct}
            onUpdateProduct={stdProducts.updateProduct}
            onDeleteProduct={stdProducts.deleteProduct}
            onCreateConversion={stdProducts.createConversion}
            onDeleteConversion={stdProducts.deleteConversion}
            onOpenDetail={(p) => { setDetailProduct(p); setDetailOpen(true); }}
          />
        </TabsContent>

        <TabsContent value="mappings">
          <SupplierItemMappingsTab
            mappings={stdProducts.mappings}
            products={stdProducts.products}
            suppliers={suppliers}
            onCreateMapping={stdProducts.createMapping}
            onUpdateMapping={stdProducts.updateMapping}
            onDeleteMapping={stdProducts.deleteMapping}
          />
        </TabsContent>

        {/* Audit Documents Tab */}
        <TabsContent value="audit-docs" className="space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={auditDateFrom} onChange={(e) => setAuditDateFrom(e.target.value)} className="w-[150px]" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={auditDateTo} onChange={(e) => setAuditDateTo(e.target.value)} className="w-[150px]" />
            </div>
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={auditSupplier} onValueChange={setAuditSupplier}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Venue</Label>
              <Select value={auditVenue} onValueChange={setAuditVenue}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Venues</SelectItem>
                  <SelectItem value="Assembly">Assembly</SelectItem>
                  <SelectItem value="Caliente">Caliente</SelectItem>
                  <SelectItem value="Hanabi">Hanabi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(() => {
            const auditDocs = invoices.filter((inv) => {
              if (!inv.file_url) return false;
              if (auditSupplier !== "all" && inv.supplier_id !== auditSupplier) return false;
              if (auditVenue !== "all" && inv.venue !== auditVenue) return false;
              if (auditDateFrom && inv.invoice_date < auditDateFrom) return false;
              if (auditDateTo && inv.invoice_date > auditDateTo) return false;
              return true;
            });
            return (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{auditDocs.length} document{auditDocs.length !== 1 ? "s" : ""} found</p>
                  {auditDocs.length > 0 && (
                    <Button size="sm" variant="outline" disabled={downloading} onClick={async () => {
                      setDownloading(true);
                      try {
                        // Deduplicate by file_url — same backend file shared across invoices
                        const uniqueFiles = new Map<string, { file_url: string; file_name: string }>();
                        for (const doc of auditDocs) {
                          if (doc.file_url && !uniqueFiles.has(doc.file_url)) {
                            uniqueFiles.set(doc.file_url, {
                              file_url: doc.file_url,
                              file_name: doc.file_name || `invoice-${doc.invoice_number}`,
                            });
                          }
                        }
                        const files = Array.from(uniqueFiles.values());

                        if (files.length === 1) {
                          const { data } = await supabase.storage.from("invoice-files").createSignedUrl(files[0].file_url, 3600);
                          if (data?.signedUrl) {
                            const res = await fetch(data.signedUrl);
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = files[0].file_name;
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            URL.revokeObjectURL(url);
                          }
                        } else {
                          // Multiple unique files — bundle into zip with batched fetching
                          const zip = new JSZip();
                          const usedNames = new Set<string>();
                          const BATCH_SIZE = 5;
                          for (let i = 0; i < files.length; i += BATCH_SIZE) {
                            const batch = files.slice(i, i + BATCH_SIZE);
                            await Promise.all(batch.map(async (f) => {
                              try {
                                const { data } = await supabase.storage.from("invoice-files").createSignedUrl(f.file_url, 3600);
                                if (!data?.signedUrl) return;
                                const res = await fetch(data.signedUrl);
                                if (!res.ok) return;
                                const blob = await res.blob();
                                let name = f.file_name;
                                if (usedNames.has(name)) {
                                  const dot = name.lastIndexOf(".");
                                  const base = dot > 0 ? name.slice(0, dot) : name;
                                  const ext = dot > 0 ? name.slice(dot) : "";
                                  let counter = 2;
                                  while (usedNames.has(`${base}_${counter}${ext}`)) counter++;
                                  name = `${base}_${counter}${ext}`;
                                }
                                usedNames.add(name);
                                zip.file(name, blob);
                              } catch (e) {
                                console.warn("Failed to fetch file:", f.file_url, e);
                              }
                            }));
                          }
                          const zipBlob = await zip.generateAsync({ type: "blob" });
                          const url = URL.createObjectURL(zipBlob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "invoices.zip";
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error("Download failed:", err);
                        toast({ title: "Download failed", description: "An error occurred while downloading files.", variant: "destructive" });
                      } finally {
                        setDownloading(false);
                      }
                    }}>
                      <Download className="h-4 w-4 mr-1" />{downloading ? "Downloading..." : `Download All (${auditDocs.length})`}
                    </Button>
                  )}
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead col="invoice_number" label="Invoice #" activeKey={auditSortKey} activeDir={auditSortDir} onToggle={(k) => makeToggleSort(k, auditSortKey, setAuditSortKey, auditSortDir, setAuditSortDir)} />
                        <SortableHead col="supplier_name" label="Supplier" activeKey={auditSortKey} activeDir={auditSortDir} onToggle={(k) => makeToggleSort(k, auditSortKey, setAuditSortKey, auditSortDir, setAuditSortDir)} />
                        <SortableHead col="venue" label="Venue" activeKey={auditSortKey} activeDir={auditSortDir} onToggle={(k) => makeToggleSort(k, auditSortKey, setAuditSortKey, auditSortDir, setAuditSortDir)} />
                        <SortableHead col="invoice_date" label="Date" activeKey={auditSortKey} activeDir={auditSortDir} onToggle={(k) => makeToggleSort(k, auditSortKey, setAuditSortKey, auditSortDir, setAuditSortDir)} />
                        <SortableHead col="total_amount" label="Total" activeKey={auditSortKey} activeDir={auditSortDir} onToggle={(k) => makeToggleSort(k, auditSortKey, setAuditSortKey, auditSortDir, setAuditSortDir)} className="text-right" />
                        <SortableHead col="file_name" label="File" activeKey={auditSortKey} activeDir={auditSortDir} onToggle={(k) => makeToggleSort(k, auditSortKey, setAuditSortKey, auditSortDir, setAuditSortDir)} />
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditDocs.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {invoices.some((i) => i.file_url) ? "No documents match the current filters" : "No scanned documents yet. Use 'Scan Invoice' to upload and attach documents."}
                        </TableCell></TableRow>
                      ) : sortData(auditDocs, auditSortKey, auditSortDir).map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>{inv.supplier_name}</TableCell>
                          <TableCell>{inv.venue}</TableCell>
                          <TableCell>{inv.invoice_date}</TableCell>
                          <TableCell className="text-right font-mono">{Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{inv.file_name || "—"}</TableCell>
                          <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => {
                              setViewerFileUrl(inv.file_url!);
                              setViewerTitle(`Invoice ${inv.invoice_number}`);
                              setViewerOpen(true);
                            }}>
                              <Eye className="h-3 w-3 mr-1" />View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-3">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead col="name" label="Name" activeKey={supplierSortKey} activeDir={supplierSortDir} onToggle={(k) => makeToggleSort(k, supplierSortKey, setSupplierSortKey, supplierSortDir, setSupplierSortDir)} />
                  <SortableHead col="contact_person" label="Contact" activeKey={supplierSortKey} activeDir={supplierSortDir} onToggle={(k) => makeToggleSort(k, supplierSortKey, setSupplierSortKey, supplierSortDir, setSupplierSortDir)} />
                  <SortableHead col="email" label="Email" activeKey={supplierSortKey} activeDir={supplierSortDir} onToggle={(k) => makeToggleSort(k, supplierSortKey, setSupplierSortKey, supplierSortDir, setSupplierSortDir)} />
                  <SortableHead col="phone" label="Phone" activeKey={supplierSortKey} activeDir={supplierSortDir} onToggle={(k) => makeToggleSort(k, supplierSortKey, setSupplierSortKey, supplierSortDir, setSupplierSortDir)} />
                  <SortableHead col="payment_terms" label="Terms" activeKey={supplierSortKey} activeDir={supplierSortDir} onToggle={(k) => makeToggleSort(k, supplierSortKey, setSupplierSortKey, supplierSortDir, setSupplierSortDir)} />
                  <SortableHead col="is_active" label="Active" activeKey={supplierSortKey} activeDir={supplierSortDir} onToggle={(k) => makeToggleSort(k, supplierSortKey, setSupplierSortKey, supplierSortDir, setSupplierSortDir)} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No suppliers</TableCell></TableRow>
                ) : sortData(suppliers, supplierSortKey, supplierSortDir).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.contact_person || "—"}</TableCell>
                    <TableCell>{s.email || "—"}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{s.payment_terms || "COD"}</Badge></TableCell>
                    <TableCell>{s.is_active ? "✓" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-3">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead col="name" label="Category" activeKey={categorySortKey} activeDir={categorySortDir} onToggle={(k) => makeToggleSort(k, categorySortKey, setCategorySortKey, categorySortDir, setCategorySortDir)} />
                  <SortableHead col="description" label="Description" activeKey={categorySortKey} activeDir={categorySortDir} onToggle={(k) => makeToggleSort(k, categorySortKey, setCategorySortKey, categorySortDir, setCategorySortDir)} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No categories</TableCell></TableRow>
                ) : sortData(categories, categorySortKey, categorySortDir).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.description || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Invoice Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle>Invoice #{selectedInvoice.invoice_number}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{selectedInvoice.supplier_name}</span></div>
                  <div><span className="text-muted-foreground">Venue:</span> <span className="font-medium">{selectedInvoice.venue}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{selectedInvoice.invoice_date}</span></div>
                  <div><span className="text-muted-foreground">Due:</span> <span className="font-medium">{selectedInvoice.due_date || "—"}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_COLORS[selectedInvoice.status] || ""}>{selectedInvoice.status}</Badge></div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-bold font-mono">{Number(selectedInvoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </div>
                {selectedInvoice.notes && <p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p>}

                {/* Scanned copy link */}
                {selectedInvoice.file_url && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium flex-1">
                      {selectedInvoice.file_url.split(",").length} {selectedInvoice.file_url.split(",").length === 1 ? "page" : "pages"} attached
                    </span>
                    <Button size="sm" variant="outline" onClick={() => {
                      setViewerFileUrl(selectedInvoice.file_url!);
                      setViewerTitle(`Invoice ${selectedInvoice.invoice_number}`);
                      setViewerOpen(true);
                    }}>
                      <Eye className="h-3 w-3 mr-1" />View All
                    </Button>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openEdit(selectedInvoice)}>
                    <Pencil className="h-4 w-4 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => confirmDelete(selectedInvoice.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />Delete
                  </Button>
                  {selectedInvoice.status !== "paid" && <Button size="sm" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "paid"); setDrawerOpen(false); }}>Mark Paid</Button>}
                  {selectedInvoice.status !== "overdue" && <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "overdue"); setDrawerOpen(false); }}>Mark Overdue</Button>}
                  {selectedInvoice.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "cancelled"); setDrawerOpen(false); }}>Cancel</Button>}
                </div>

                <h3 className="text-sm font-semibold mt-4">Line Items</h3>
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Pack Size</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No line items</TableCell></TableRow>
                      ) : lineItems.map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="text-xs text-muted-foreground">{li.item_code || "—"}</TableCell>
                          <TableCell>{li.description}</TableCell>
                          <TableCell className="text-xs">{li.pack_size || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{li.quantity}</TableCell>
                          <TableCell>{li.unit || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{li.weight ? `${li.weight} KG` : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{Number(li.unit_price).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{Number(li.total).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Invoice Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-none w-[98vw] h-[92vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Edit Invoice</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Supplier</Label>
                <Select value={editInv.supplier_id} onValueChange={(v) => setEditInv({ ...editInv, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Venue</Label>
                <Select value={editInv.venue} onValueChange={(v) => setEditInv({ ...editInv, venue: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assembly">Assembly</SelectItem>
                    <SelectItem value="Caliente">Caliente</SelectItem>
                    <SelectItem value="Hanabi">Hanabi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Invoice #</Label>
                <Input value={editInv.invoice_number} onChange={(e) => setEditInv({ ...editInv, invoice_number: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={editInv.status} onValueChange={(v) => setEditInv({ ...editInv, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Invoice Date</Label>
                <Input type="date" value={editInv.invoice_date} onChange={(e) => setEditInv({ ...editInv, invoice_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={editInv.due_date} onChange={(e) => setEditInv({ ...editInv, due_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea value={editInv.notes} onChange={(e) => setEditInv({ ...editInv, notes: e.target.value })} rows={1} />
              </div>
            </div>

            {/* Warning banners */}
            {editLines.some(l => l.unmatched && l.description.trim()) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span><strong>{editLines.filter(l => l.unmatched && l.description.trim()).length} item(s) not matched to Product Master</strong> — use autocomplete to match.</span>
              </div>
            )}
            {editLines.some(l => l.price_changed) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span><strong>{editLines.filter(l => l.price_changed).length} price change(s) detected</strong> — invoice prices differ from Product Master.</span>
              </div>
            )}

            <h3 className="text-sm font-semibold">Line Items ({editLines.length})</h3>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs border-collapse min-w-[1200px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-7">#</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[90px]">Internal SKU</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium min-w-[140px]">Internal Name</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[90px]">External SKU</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium min-w-[160px]">External Name</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[75px]">Purch. UOM</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[60px]">Purch. Qty</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[75px]">Stock UOM</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[65px]">Stock Qty</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[85px]">Purch. Cost</th>
                    <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[80px]">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {editLines.map((line, i) => {
                    const rowClass = line.unmatched && line.description.trim()
                      ? "bg-destructive/10 border-l-2 border-l-destructive"
                      : line.price_changed
                      ? "bg-blue-500/10 border-l-2 border-l-blue-500"
                      : "";
                    return (
                      <tr key={i} className={`border-b border-border/50 ${rowClass}`}>
                        <td className="px-1 py-1 text-muted-foreground font-medium align-top pt-2.5">{i + 1}</td>
                        {/* Internal SKU - read-only */}
                        <td className="px-1 py-1 align-top">
                          <Input value={line.matched_sku} readOnly tabIndex={-1} className="text-xs bg-muted/50 cursor-default font-mono h-8" placeholder="—" />
                        </td>
                        {/* Internal Product Name - read-only */}
                        <td className="px-1 py-1 align-top">
                          <Input value={line.matched_internal_name} readOnly tabIndex={-1} className="text-xs bg-muted/50 cursor-default h-8" placeholder="—" />
                        </td>
                        {/* External SKU - editable with autocomplete */}
                        <td className="px-1 py-1 align-top">
                          <ProductAutocomplete
                            value={line.item_code}
                            onChange={(v) => updateEditLine(i, "item_code", v)}
                            onSelect={(p) => selectEditProduct(i, p as any)}
                            products={editFilteredPM as any}
                            searchField="code"
                            placeholder="Code"
                            className="text-xs h-8"
                          />
                        </td>
                        {/* External Name - editable with autocomplete */}
                        <td className="px-1 py-1 align-top">
                          <div className="relative">
                            <ProductAutocomplete
                              value={line.description}
                              onChange={(v) => updateEditLine(i, "description", v)}
                              onSelect={(p) => selectEditProduct(i, p as any)}
                              products={editFilteredPM as any}
                              searchField="name"
                              placeholder="Item name"
                              className="text-xs h-8"
                            />
                            {line.unmatched && line.description.trim() && (
                              <Badge className="absolute -top-2 -right-1 text-[8px] px-1 py-0 bg-destructive text-destructive-foreground">Unmatched</Badge>
                            )}
                          </div>
                        </td>
                        {/* Purchase UOM - read-only */}
                        <td className="px-1 py-1 align-top">
                          <Input value={line.matched_purchase_uom} readOnly tabIndex={-1} className="text-xs bg-muted/50 cursor-default h-8" placeholder="—" />
                        </td>
                        {/* Purchase Qty - editable */}
                        <td className="px-1 py-1 align-top">
                          <Input type="number" value={line.quantity} onChange={(e) => updateEditLine(i, "quantity", e.target.value)} className="text-xs h-8" />
                        </td>
                        {/* Stock UOM - read-only */}
                        <td className="px-1 py-1 align-top">
                          <Input value={line.matched_stock_uom} readOnly tabIndex={-1} className="text-xs bg-muted/50 cursor-default h-8" placeholder="—" />
                        </td>
                        {/* Stock Qty - auto-calculated */}
                        <td className="px-1 py-1 align-top">
                          <Input
                            value={line.matched_sku ? String(((parseFloat(line.quantity) || 0) * (line.matched_stock_qty_ratio || 1)).toFixed(2).replace(/\.00$/, "")) : "—"}
                            readOnly tabIndex={-1} className="text-xs bg-muted/50 cursor-default h-8 font-mono" placeholder="—"
                          />
                        </td>
                        {/* Purchase Cost - editable */}
                        <td className="px-1 py-1 align-top">
                          <div className="relative">
                            <Input type="number" value={line.unit_price} onChange={(e) => updateEditLine(i, "unit_price", e.target.value)} className={`text-xs h-8 ${line.price_changed ? "border-blue-500" : ""}`} />
                            {line.price_changed && line.pm_unit_price !== undefined && (
                              <span className="block text-[9px] text-blue-600 dark:text-blue-400 mt-0.5 whitespace-nowrap">PM: ${line.pm_unit_price.toFixed(2)}</span>
                            )}
                          </div>
                        </td>
                        {/* Total */}
                        <td className="px-1 py-1 align-top">
                          <Input type="number" value={line.total} onChange={(e) => updateEditLine(i, "total", e.target.value)} className="text-xs font-medium h-8" />
                        </td>
                        {/* Delete */}
                        <td className="px-1 py-1 align-top">
                          {editLines.length > 1 && (
                            <Button size="icon" variant="ghost" onClick={() => removeEditLine(i)} className="h-8 w-8"><Trash2 className="h-3 w-3" /></Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={addEditLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>

            <div className="text-right text-sm border-t pt-2">
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-mono font-medium">
                {editLines.reduce((s, l) => {
                  const w = l.weight ? parseFloat(l.weight) : null;
                  const price = parseFloat(l.unit_price) || 0;
                  const qty = parseFloat(l.quantity) || 0;
                  const disc = parseFloat(l.discount) || 0;
                  return s + ((w ? w * price : qty * price) - disc);
                }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-muted-foreground ml-4">Total: </span>
              <span className="font-mono font-bold">
                {editLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editInv.supplier_id || !editInv.invoice_number || !editInv.invoice_date}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Select value={newInv.supplier_id} onValueChange={(v) => setNewInv({ ...newInv, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Venue</Label>
                <Select value={newInv.venue} onValueChange={(v) => setNewInv({ ...newInv, venue: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assembly">Assembly</SelectItem>
                    <SelectItem value="Caliente">Caliente</SelectItem>
                    <SelectItem value="Hanabi">Hanabi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoice Number</Label>
                <Input value={newInv.invoice_number} onChange={(e) => setNewInv({ ...newInv, invoice_number: e.target.value })} />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input type="date" value={newInv.invoice_date} onChange={(e) => setNewInv({ ...newInv, invoice_date: e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={newInv.notes} onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })} rows={2} />
              </div>
            </div>

            <h3 className="text-sm font-semibold">Line Items</h3>
            <div className="space-y-2">
              {newLines.map((line, i) => (
                <div key={i} className="grid grid-cols-[70px_1fr_80px_55px_55px_65px_75px_70px_32px] gap-1 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs">Code</Label>}
                    <Input value={line.item_code} onChange={(e) => updateLine(i, "item_code", e.target.value)} placeholder="Code" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Description</Label>}
                    <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Item" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Pack Size</Label>}
                    <Input value={line.pack_size} onChange={(e) => updateLine(i, "pack_size", e.target.value)} placeholder="4X4LB" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Unit</Label>}
                    <Input value={line.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} placeholder="CTN" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Weight</Label>}
                    <Input type="number" value={line.weight} onChange={(e) => updateLine(i, "weight", e.target.value)} placeholder="KG" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Price</Label>}
                    <Input type="number" value={line.unit_price} onChange={(e) => updateLine(i, "unit_price", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Tax</Label>}
                    <Input type="number" value={line.tax_amount} onChange={(e) => updateLine(i, "tax_amount", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {newLines.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>
            </div>

            <div className="text-right text-sm border-t pt-2">
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-mono font-medium">
                {newLines.reduce((s, l) => {
                  const w = l.weight ? parseFloat(l.weight) : null;
                  const price = parseFloat(l.unit_price) || 0;
                  const qty = parseFloat(l.quantity) || 0;
                  return s + (w ? w * price : qty * price);
                }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={!newInv.supplier_id || !newInv.invoice_number || !newInv.invoice_date}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></div>
            <div><Label>Contact Person</Label><Input value={newSupplier.contact_person} onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></div>
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Select value={newSupplier.payment_terms} onValueChange={(v) => setNewSupplier({ ...newSupplier, payment_terms: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COD">COD</SelectItem>
                  <SelectItem value="Net 7">Net 7</SelectItem>
                  <SelectItem value="Net 14">Net 14</SelectItem>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Address</Label><Textarea value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSupplier} disabled={!newSupplier.name.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
          <div><Label>Category Name</Label><Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Spirits" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={!newCatName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Invoice"
        description="Are you sure? This invoice and all its line items will be permanently removed."
      />

      {/* Standard Product Detail Modal */}
      <StandardProductDetailModal
        product={detailProduct}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        conversions={stdProducts.conversions}
        mappings={stdProducts.mappings}
        onUpdateProduct={stdProducts.updateProduct}
        onUpdateMapping={stdProducts.updateMapping}
        onDeleteMapping={stdProducts.deleteMapping}
        fetchPurchaseHistory={stdProducts.fetchPurchaseHistory}
      />
      <AttachmentViewerDialog open={viewerOpen} onOpenChange={setViewerOpen} fileUrl={viewerFileUrl} title={viewerTitle} />
    </div>
  );
}
