import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { resolveProductMatch, resolveExactMatch } from "@/utils/productMasterResolver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Search, Trash2, ScanLine, Pencil, Eye, ArrowUpDown, ArrowUp, ArrowDown, X, Download, Plus, AlertTriangle } from "lucide-react";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import ProductAutocomplete from "@/components/invoices/ProductAutocomplete";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import { useVirtualizer } from "@tanstack/react-virtual";

// Grid template for virtualized invoice rows (must match header)
const INV_GRID_COLS = "100px 120px minmax(160px,1fr) 90px 100px 110px 90px 90px";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  verified: "bg-indigo-100 text-indigo-800 border-indigo-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  partial: "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-muted text-muted-foreground",
  under_review: "bg-orange-100 text-orange-800 border-orange-300",
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
const normalizeSupplierName = (value: string) =>
  value.toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\b(limited|ltd|co|company)\b/g, " ").replace(/\s+/g, " ").trim();

interface ProductMasterEntry {
  id: string;
  supplier_entry_id?: string;
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

interface EditableInvoiceLine {
  id?: string;
  item_code: string;
  description: string;
  pack_size: string;
  quantity: string;
  unit: string;
  weight: string;
  unit_price: string;
  discount: string;
  tax_amount: string;
  total: string;
  product_master_id: string | null;
  matched_sku: string;
  matched_internal_name: string;
  matched_stock_uom: string;
  matched_purchase_uom: string;
  matched_stock_qty_ratio: number;
  unmatched: boolean;
  price_changed: boolean;
  pm_unit_price?: number;
}

const emptyEditLine: EditableInvoiceLine = {
  item_code: "",
  description: "",
  pack_size: "",
  quantity: "1",
  unit: "",
  weight: "",
  unit_price: "0",
  discount: "0",
  tax_amount: "0",
  total: "0",
  product_master_id: null,
  matched_sku: "",
  matched_internal_name: "",
  matched_stock_uom: "",
  matched_purchase_uom: "",
  matched_stock_qty_ratio: 1,
  unmatched: false,
  price_changed: false,
};

export default function ProcurementInvoicesTab() {
  const { invoices, suppliers, loading, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus } = useInvoiceData();
  const { user } = useAuth();

  const [productMaster, setProductMaster] = useState<ProductMasterEntry[]>([]);
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState<string>("__latest__");
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ key: "invoice_date", dir: "desc" }]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Invoice>>({});
  const [editLines, setEditLines] = useState<EditableInvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);

  const batchFileRef = useRef<{ size: number; url: string; name: string } | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  useEffect(() => {
    Promise.all([
      fetchAllRows("product_master", "id, internal_sku, internal_product_name, external_sku, supplier_product_name, supplier, purchase_unit_cost, purchase_unit, stock_uom, stock_qty"),
      fetchAllRows("product_suppliers", "id, product_master_id, supplier, external_sku, supplier_product_name, purchase_unit_cost, purchase_unit, stock_uom, stock_qty"),
    ]).then(([pm, ps]) => {
      const entries: ProductMasterEntry[] = [];

      for (const p of pm) {
        const supplierEntries = ps.filter((s: any) => s.product_master_id === p.id);
        if (supplierEntries.length > 0) {
          for (const s of supplierEntries) {
            entries.push({
              id: p.id,
              supplier_entry_id: s.id,
              internal_sku: p.internal_sku,
              external_sku: s.external_sku ?? "",
              internal_product_name: p.internal_product_name,
              supplier_product_name: s.supplier_product_name || p.supplier_product_name || p.internal_product_name || "",
              purchase_unit_cost: s.purchase_unit_cost ?? p.purchase_unit_cost ?? 0,
              supplier: s.supplier || p.supplier || "",
              purchase_unit: s.purchase_unit || p.purchase_unit || "",
              stock_uom: s.stock_uom || p.stock_uom || "",
              stock_qty: s.stock_qty ?? p.stock_qty ?? 1,
            });
          }
        } else {
          entries.push({
            id: p.id,
            internal_sku: p.internal_sku,
            external_sku: p.external_sku || "",
            internal_product_name: p.internal_product_name,
            supplier_product_name: p.supplier_product_name || p.internal_product_name || "",
            purchase_unit_cost: p.purchase_unit_cost ?? 0,
            supplier: p.supplier || "",
            purchase_unit: p.purchase_unit || "",
            stock_uom: p.stock_uom || "",
            stock_qty: p.stock_qty ?? 1,
          });
        }
      }

      setProductMaster(entries);
    });
  }, []);

  const openAttachmentViewer = (fileUrl: string, invoiceNumber: string) => {
    setViewerFileUrl(fileUrl);
    setViewerTitle(`Invoice ${invoiceNumber}`);
    setViewerOpen(true);
  };

  const toggleSort = (key: string, additive: boolean) => {
    setSortColumns(prev => toggleSortColumns(prev, key, additive));
  };

  const SortIcon = ({ col }: { col: string }) => {
    const entry = sortColumns.find(s => s.key === col);
    if (!entry) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return (
      <span className="inline-flex items-center gap-0.5">
        {entry.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {sortColumns.length > 1 && <span className="text-[9px] font-bold">{sortColumns.indexOf(entry) + 1}</span>}
      </span>
    );
  };

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) {
      if (inv.invoice_date) set.add(inv.invoice_date.substring(0, 7));
    }
    return [...set].sort().reverse();
  }, [invoices]);

  // Default month filter to most recent month once invoices load
  useEffect(() => {
    if (monthFilter === "__latest__" && months.length > 0) {
      setMonthFilter(months[0]);
    }
  }, [months, monthFilter]);

  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split("-");
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  const filtered = useMemo(() => {
    const result = invoices.filter((inv) => {
      if (venueFilter !== "all" && inv.venue !== venueFilter) return false;
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (monthFilter !== "all" && monthFilter !== "__latest__" && (!inv.invoice_date || !inv.invoice_date.startsWith(monthFilter))) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q) || (inv.supplier_name || "").toLowerCase().includes(q);
    });

    return sortRows(result, sortColumns);
  }, [invoices, venueFilter, statusFilter, monthFilter, search, sortColumns]);

  const columns = [
    { key: "invoice_date", label: "Date", w: "w-[100px]" },
    { key: "invoice_number", label: "Invoice #", w: "w-[120px]" },
    { key: "supplier_name", label: "Supplier", w: "min-w-[160px]" },
    { key: "venue", label: "Venue", w: "w-[90px]" },
    { key: "due_date", label: "Due Date", w: "w-[100px]" },
    { key: "total_amount", label: "Total", w: "w-[110px]", align: "right" as const },
    { key: "status", label: "Status", w: "w-[90px]" },
  ];

  const totalAmount = filtered.reduce((s, inv) => s + Number(inv.total_amount), 0);

  const getSupplierNameById = (supplierId?: string | null) => {
    if (!supplierId) return "";
    return suppliers.find((supplier) => supplier.id === supplierId)?.name || "";
  };

  const getScopedProductMaster = (supplierId?: string | null) => {
    const supplierName = getSupplierNameById(supplierId) || selectedInvoice?.supplier_name || "";
    if (!supplierName) return productMaster;

    const normSupplier = normalizeSupplierName(supplierName);
    return [...productMaster].sort((a, b) => {
      const aMatch = a.supplier && (() => { const n = normalizeSupplierName(a.supplier!); return n === normSupplier || n.includes(normSupplier) || normSupplier.includes(n); })() ? 0 : 1;
      const bMatch = b.supplier && (() => { const n = normalizeSupplierName(b.supplier!); return n === normSupplier || n.includes(normSupplier) || normSupplier.includes(n); })() ? 0 : 1;
      return aMatch - bMatch;
    });
  };

  const findProductMatch = (line: Partial<InvoiceLineItem> | Partial<EditableInvoiceLine>, supplierId?: string | null) => {
    const supplierName = getSupplierNameById(supplierId) || selectedInvoice?.supplier_name || "";
    return resolveProductMatch(
      {
        itemCode: line.item_code || "",
        description: line.description || "",
        productMasterId: line.product_master_id,
        internalSku: "matched_sku" in line ? (line as any).matched_sku : undefined,
      },
      productMaster,
      supplierName,
    );
  };

  const calculateEditLineTotal = (line: Pick<EditableInvoiceLine, "quantity" | "unit_price" | "discount" | "tax_amount">, supplierName?: string) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const discount = parseFloat(line.discount) || 0;
    const tax = parseFloat(line.tax_amount) || 0;
    const raw = (qty * price) - discount + tax;
    const isBW = (supplierName || "").toLowerCase().includes("beverage world");
    return isBW ? String(Math.round(raw)) : raw.toFixed(2);
  };

  const hydrateEditLine = (line: Partial<InvoiceLineItem> | EditableInvoiceLine, supplierId?: string | null): EditableInvoiceLine => {
    const matchedProduct = findProductMatch(line, supplierId);
    const currentPrice = parseFloat(String(line.unit_price ?? 0)) || 0;
    const pmPrice = matchedProduct?.purchase_unit_cost;
    const supplierName = getSupplierNameById(supplierId || null) || "";
    const isBW = supplierName.toLowerCase().includes("beverage world");

    // When matched by SKU, sync description from the matched product entry
    const itemCode = (line.item_code || "").trim().toLowerCase();
    const matchedBySku = matchedProduct && itemCode && (matchedProduct.external_sku || "").trim().toLowerCase() === itemCode;
    const description = matchedBySku
      ? (matchedProduct.supplier_product_name || matchedProduct.internal_product_name || line.description || "")
      : (line.description || "");

    const qtyStr = String(line.quantity ?? "1");
    const priceStr = String(line.unit_price ?? 0);
    const discStr = String(line.discount ?? 0);
    const taxStr = String(line.tax_amount ?? 0);
    const computedTotal = calculateEditLineTotal({ quantity: qtyStr, unit_price: priceStr, discount: discStr, tax_amount: taxStr }, supplierName);

    // PM is the source of truth for External SKU when a supplier-scoped product is matched.
    // Empty PM SKU must stay empty — never fall back to the scanned/typed code.
    const resolvedItemCode = matchedProduct
      ? (matchedProduct.external_sku ?? "")
      : (line.item_code || "");

    return {
      id: "id" in line ? line.id : undefined,
      item_code: resolvedItemCode,
      description,
      pack_size: line.pack_size || "",
      quantity: qtyStr,
      unit: line.unit || "",
      weight: line.weight ? String(line.weight) : "",
      unit_price: priceStr,
      discount: discStr,
      tax_amount: taxStr,
      total: isBW
        ? computedTotal
        : ("total" in line && typeof line.total === "string" ? line.total : computedTotal),
      product_master_id: matchedProduct?.id || line.product_master_id || null,
      matched_sku: matchedProduct?.internal_sku || "",
      matched_internal_name: matchedProduct?.internal_product_name || "",
      matched_stock_uom: matchedProduct?.stock_uom || "",
      matched_purchase_uom: matchedProduct?.purchase_unit || "",
      matched_stock_qty_ratio: matchedProduct?.stock_qty ?? 1,
      unmatched: !matchedProduct && Boolean((line.description || "").trim()),
      price_changed: typeof pmPrice === "number" && pmPrice > 0 ? Math.abs(currentPrice - pmPrice) > 0.01 : false,
      pm_unit_price: typeof pmPrice === "number" && pmPrice > 0 ? pmPrice : undefined,
    };
  };

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
    setEditLines(lineItems.map((line) => hydrateEditLine(line, selectedInvoice.supplier_id)));
    setDrawerOpen(false);
    setEditing(true);
  };

  useEffect(() => {
    if (!editing || !selectedInvoice) return;
    const supplierId = editForm.supplier_id || selectedInvoice.supplier_id;
    setEditLines((prev) => prev.map((line) => hydrateEditLine(line, supplierId)));
  }, [editing, productMaster, editForm.supplier_id, selectedInvoice]);

  const handleSaveEdit = async () => {
    if (!selectedInvoice) return;

    setSaving(true);
    const mappedLines = editLines
      .filter((line) => line.description.trim())
      .map((line) => ({
        item_code: line.item_code || "",
        description: line.description,
        pack_size: line.pack_size || "",
        category_id: null,
        quantity: parseFloat(line.quantity) || 0,
        unit: line.unit || null,
        weight: line.weight ? parseFloat(line.weight) || 0 : null,
        unit_price: parseFloat(line.unit_price) || 0,
        discount: parseFloat(line.discount) || 0,
        tax_amount: parseFloat(line.tax_amount) || 0,
        total: parseFloat(line.total) || 0,
        notes: null,
        product_master_id: line.product_master_id,
      }));

    // Subtotal/total are computed from raw line values to avoid 2dp drift
    // (matches scanner behavior — see VegFresh 1,240.50 fix).
    const supplierNameForSave = getSupplierNameById(editForm.supplier_id || selectedInvoice.supplier_id) || selectedInvoice.supplier_name || "";
    const isBWSave = supplierNameForSave.toLowerCase().includes("beverage world");
    const rawSum = editLines.reduce((sum, line) => {
      const qty = parseFloat(line.quantity) || 0;
      const price = parseFloat(line.unit_price) || 0;
      const discount = parseFloat(line.discount) || 0;
      const tax = parseFloat(line.tax_amount) || 0;
      return sum + ((qty * price) - discount + tax);
    }, 0);
    const taxSum = editLines.reduce((sum, line) => sum + (parseFloat(line.tax_amount) || 0), 0);
    const totalAmount = isBWSave ? Math.round(rawSum) : Math.round((rawSum + Number.EPSILON) * 100) / 100;
    const subtotalAmount = isBWSave ? Math.round(rawSum - taxSum) : Math.round(((rawSum - taxSum) + Number.EPSILON) * 100) / 100;

    const success = await updateInvoice(
      selectedInvoice.id,
      {
        ...editForm,
        subtotal: subtotalAmount,
        tax_amount: taxSum,
        total_amount: totalAmount,
      } as any,
      mappedLines
    );

    setSaving(false);

    if (success) {
      setEditing(false);
      setSelectedInvoice(null);
      setLineItems([]);
    }
  };

  const updateEditLine = (idx: number, field: keyof EditableInvoiceLine, value: string) => {
    setEditLines((prev) => {
      const updated = [...prev];
      const nextLine: EditableInvoiceLine = { ...updated[idx], [field]: value };

      if (["quantity", "unit_price", "discount", "tax_amount"].includes(field)) {
        const supplierName = getSupplierNameById(editForm.supplier_id || selectedInvoice?.supplier_id || null) || selectedInvoice?.supplier_name || "";
        nextLine.total = calculateEditLineTotal(nextLine, supplierName);
      }

      if (field === "unit_price" && nextLine.pm_unit_price) {
        nextLine.price_changed = Math.abs((parseFloat(value) || 0) - nextLine.pm_unit_price) > 0.01;
      }

      if (field === "item_code" || field === "description") {
        // Free-text edit: clear PM linkage so the edit sticks. Re-linking
        // happens at save time (handleEditSave) or via explicit autocomplete pick.
        nextLine.product_master_id = null;
        nextLine.matched_sku = "";
        nextLine.matched_internal_name = "";
        nextLine.matched_stock_uom = "";
        nextLine.matched_purchase_uom = "";
        nextLine.matched_stock_qty_ratio = 1;
        nextLine.pm_unit_price = undefined;
        nextLine.price_changed = false;
        nextLine.unmatched = Boolean((nextLine.item_code || "").trim() || (nextLine.description || "").trim());
      }

      updated[idx] = nextLine;
      return updated;
    });
  };

  const selectEditProduct = (idx: number, product: ProductMasterEntry) => {
    setEditLines((prev) => {
      const updated = [...prev];
      const currentLine = updated[idx];
      // Only use the product's external SKU if it belongs to the same supplier
      const editSupplierName = selectedInvoice ? suppliers.find(s => s.id === selectedInvoice.supplier_id)?.name : "";
      const supplierMatch = editSupplierName && product.supplier &&
        product.supplier.toLowerCase().includes(editSupplierName.toLowerCase());
      const nextLine: EditableInvoiceLine = {
        ...currentLine,
        // PM SKU is authoritative — empty stays empty (no fallback to scanned code).
        item_code: product.external_sku ?? "",
        description: product.supplier_product_name || product.internal_product_name || currentLine.description,
        product_master_id: product.id,
        matched_sku: product.internal_sku,
        matched_internal_name: product.internal_product_name || "",
        matched_stock_uom: product.stock_uom || "",
        matched_purchase_uom: product.purchase_unit || "",
        matched_stock_qty_ratio: product.stock_qty ?? 1,
        unmatched: false,
        pm_unit_price: product.purchase_unit_cost,
        price_changed: typeof product.purchase_unit_cost === "number" && product.purchase_unit_cost > 0
          ? Math.abs((parseFloat(currentLine.unit_price) || 0) - product.purchase_unit_cost) > 0.01
          : false,
      };
      updated[idx] = nextLine;
      return updated;
    });
  };

  const addEditLine = () => setEditLines((prev) => [...prev, { ...emptyEditLine }]);
  const removeEditLine = (idx: number) => setEditLines((prev) => prev.filter((_, lineIdx) => lineIdx !== idx));

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
          .filter((name): name is string => Boolean(name))
      )
    ).sort((a, b) => a.localeCompare(b));

    const options = (pmNames.length > 0 ? pmNames : suppliers.map((supplier) => supplier.name))
      .map((name) => {
        const norm = normalizeSupplierName(name);
        const match = suppliers.find((supplier) => normalizeSupplierName(supplier.name) === norm)
          ?? suppliers.find((supplier) => {
            const normalizedName = normalizeSupplierName(supplier.name);
            return normalizedName.includes(norm) || norm.includes(normalizedName);
          });
        return { label: name, value: match?.id ?? `pm:${name}` };
      })
      .filter((option, index, allOptions) => allOptions.findIndex((candidate) => candidate.label === option.label) === index);

    if (editForm.supplier_id && !options.some((option) => option.value === editForm.supplier_id)) {
      const currentSupplier = suppliers.find((supplier) => supplier.id === editForm.supplier_id);
      if (currentSupplier) options.unshift({ label: currentSupplier.name, value: currentSupplier.id });
    }

    return options;
  }, [productMaster, suppliers, editForm.supplier_id]);

  const editFilteredPM = useMemo(() => getScopedProductMaster(editForm.supplier_id), [productMaster, suppliers, editForm.supplier_id, selectedInvoice]);

  // Sum from raw line values (qty × price − discount + tax) so subtotal/total
  // match the scanner's rounding behavior (e.g. VegFresh 1,240.50 vs 1,240.49).
  const editSupplierNameForTotal = getSupplierNameById(editForm.supplier_id || selectedInvoice?.supplier_id) || selectedInvoice?.supplier_name || "";
  const editIsBW = editSupplierNameForTotal.toLowerCase().includes("beverage world");
  const editRawSum = editLines.reduce((sum, line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const discount = parseFloat(line.discount) || 0;
    const tax = parseFloat(line.tax_amount) || 0;
    return sum + ((qty * price) - discount + tax);
  }, 0);
  const editTaxSum = editLines.reduce((sum, line) => sum + (parseFloat(line.tax_amount) || 0), 0);
  const editTotal = editIsBW ? Math.round(editRawSum) : Math.round((editRawSum + Number.EPSILON) * 100) / 100;
  const editSubtotal = editIsBW ? Math.round(editRawSum - editTaxSum) : Math.round(((editRawSum - editTaxSum) + Number.EPSILON) * 100) / 100;
  const unmatchedCount = editLines.filter((line) => line.unmatched && line.description.trim()).length;
  const priceChangedCount = editLines.filter((line) => line.price_changed).length;

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading invoices...</div>;

  if (editing && selectedInvoice) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Invoice editor</p>
            <h2 className="text-2xl font-bold font-display">Edit Invoice {editForm.invoice_number || selectedInvoice.invoice_number}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" />Close
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.supplier_id || !editForm.invoice_number || !editForm.invoice_date}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4 md:p-6 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={editForm.supplier_id || ""} onValueChange={(value) => setEditForm((form) => ({ ...form, supplier_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {editSupplierOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Invoice #</Label>
              <Input value={editForm.invoice_number || ""} onChange={(e) => setEditForm((form) => ({ ...form, invoice_number: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Venue</Label>
              <Select value={editForm.venue || ""} onValueChange={(value) => setEditForm((form) => ({ ...form, venue: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Assembly">Assembly</SelectItem>
                  <SelectItem value="Caliente">Caliente</SelectItem>
                  <SelectItem value="Hanabi">Hanabi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input type="date" value={editForm.invoice_date || ""} onChange={(e) => setEditForm((form) => ({ ...form, invoice_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={editForm.due_date || ""} onChange={(e) => setEditForm((form) => ({ ...form, due_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={editForm.status || "pending"} onValueChange={(value) => setEditForm((form) => ({ ...form, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 xl:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm((form) => ({ ...form, notes: e.target.value }))} className="min-h-[42px]" rows={1} />
            </div>
          </div>

          {unmatchedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><strong>{unmatchedCount} item(s) not matched to Product Master</strong> — use autocomplete to match.</span>
            </div>
          )}

          {priceChangedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-accent/40 p-3 text-sm text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
              <span><strong>{priceChangedCount} price change(s) detected</strong> — invoice prices differ from Product Master.</span>
            </div>
          )}

          <h4 className="text-sm font-semibold">Line Items ({editLines.length})</h4>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[1350px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-7 px-1 py-1.5 text-left font-medium text-muted-foreground">#</th>
                  <th className="w-[90px] px-1 py-1.5 text-left font-medium text-muted-foreground">Internal SKU</th>
                  <th className="min-w-[140px] px-1 py-1.5 text-left font-medium text-muted-foreground">Internal Name</th>
                  <th className="w-[90px] px-1 py-1.5 text-left font-medium text-muted-foreground">External SKU</th>
                  <th className="min-w-[160px] px-1 py-1.5 text-left font-medium text-muted-foreground">External Name</th>
                  <th className="w-[75px] px-1 py-1.5 text-left font-medium text-muted-foreground">Purch. UOM</th>
                  <th className="w-[85px] px-1 py-1.5 text-left font-medium text-muted-foreground">Purch. Qty</th>
                  <th className="w-[75px] px-1 py-1.5 text-left font-medium text-muted-foreground">Stock UOM</th>
                  <th className="w-[85px] px-1 py-1.5 text-left font-medium text-muted-foreground">Stock Qty</th>
                  <th className="w-[95px] px-1 py-1.5 text-left font-medium text-muted-foreground">Purch. Cost</th>
                  <th className="w-[90px] px-1 py-1.5 text-left font-medium text-muted-foreground">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {editLines.map((line, index) => {
                  const rowClass = line.unmatched && line.description.trim()
                    ? "bg-destructive/10 border-l-2 border-l-destructive"
                    : line.price_changed
                    ? "bg-accent/40 border-l-2 border-l-primary"
                    : "";

                  return (
                    <tr key={line.id || index} className={`border-b border-border/50 ${rowClass}`}>
                      <td className="px-1 py-1 pt-2.5 align-top font-medium text-muted-foreground">{index + 1}</td>
                      <td className="px-1 py-1 align-top">
                        <Input value={line.matched_sku} readOnly tabIndex={-1} className="h-8 cursor-default bg-muted/50 font-mono text-xs" placeholder="—" />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <div className="whitespace-normal break-words text-xs min-h-[32px] px-2 py-1.5 bg-muted/50 rounded-md border border-input cursor-default">{line.matched_internal_name || <span className="text-muted-foreground">—</span>}</div>
                      </td>
                      <td className="px-1 py-1 align-top">
                        <ProductAutocomplete
                          value={line.item_code}
                          onChange={(value) => updateEditLine(index, "item_code", value)}
                          onSelect={(product) => selectEditProduct(index, product as ProductMasterEntry)}
                          products={editFilteredPM}
                          searchField="code"
                          placeholder="Code"
                          className="h-8 text-xs"
                          currentSupplier={selectedInvoice ? suppliers.find(s => s.id === selectedInvoice.supplier_id)?.name : undefined}
                        />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <div className="relative">
                          <ProductAutocomplete
                            value={line.description}
                            onChange={(value) => updateEditLine(index, "description", value)}
                            onSelect={(product) => selectEditProduct(index, product as ProductMasterEntry)}
                            products={editFilteredPM}
                            searchField="name"
                            placeholder="Item name"
                            className="h-8 text-xs"
                            currentSupplier={selectedInvoice ? suppliers.find(s => s.id === selectedInvoice.supplier_id)?.name : undefined}
                          />
                          {line.unmatched && line.description.trim() && (
                            <Badge className="absolute -top-2 -right-1 bg-destructive px-1 py-0 text-[8px] text-destructive-foreground">Unmatched</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-1 align-top">
                        <Input value={line.matched_purchase_uom} readOnly tabIndex={-1} className="h-8 cursor-default bg-muted/50 text-xs" placeholder="—" />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <Input type="number" value={line.quantity} onChange={(e) => updateEditLine(index, "quantity", e.target.value)} className="h-8 text-xs min-w-[85px]" />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <Input value={line.matched_stock_uom} readOnly tabIndex={-1} className="h-8 cursor-default bg-muted/50 text-xs" placeholder="—" />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <Input
                          value={line.matched_sku ? String(((parseFloat(line.quantity) || 0) * (line.matched_stock_qty_ratio || 1)).toFixed(2).replace(/\.00$/, "")) : "—"}
                          readOnly
                          tabIndex={-1}
                           className="h-8 cursor-default bg-muted/50 font-mono text-xs min-w-[75px]"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <div className="relative">
                          <Input
                            type="number"
                            value={line.unit_price}
                            onChange={(e) => updateEditLine(index, "unit_price", e.target.value)}
                            className={`h-8 text-xs min-w-[95px] ${line.price_changed ? "border-primary" : ""}`}
                          />
                          {line.price_changed && line.pm_unit_price !== undefined && (
                            <span className="mt-0.5 block whitespace-nowrap text-[9px] text-primary">PM: ${line.pm_unit_price.toFixed(2)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-1 align-top">
                        <Input value={line.total} readOnly tabIndex={-1} className="h-8 text-xs font-medium min-w-[90px] bg-muted/50 cursor-default font-mono" />
                      </td>
                      <td className="px-1 py-1 align-top">
                        {editLines.length > 1 && (
                          <Button size="icon" variant="ghost" onClick={() => removeEditLine(index)} className="h-8 w-8">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button variant="outline" size="sm" onClick={addEditLine}>
            <Plus className="h-3 w-3 mr-1" />Add Line
          </Button>

          <div className="border-t pt-2 text-right text-sm">
            <span className="text-muted-foreground">Subtotal: </span>
            <span className="font-mono font-medium">{editSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span className="ml-4 text-muted-foreground">Total: </span>
            <span className="font-mono font-bold">{editTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    );
  }

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
                discount: inv.discount ?? 0,
                status: inv.status || "pending",
                subtotal: lines.reduce((sum, line) => sum + line.total - line.tax_amount, 0),
                tax_amount: lines.reduce((sum, line) => sum + line.tax_amount, 0),
                total_amount: lines.reduce((sum, line) => sum + line.total, 0),
                entered_by: user?.id || "",
              },
              lines,
              fileUrl,
              fileName
            );
          }}
          onClose={() => {
            setScannerOpen(false);
            batchFileRef.current = null;
          }}
          userId={user?.id || ""}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search invoice # or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
        </div>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Venues</SelectItem>
            <SelectItem value="Assembly">Assembly</SelectItem>
            <SelectItem value="Caliente">Caliente</SelectItem>
            <SelectItem value="Hanabi">Hanabi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter === "__latest__" ? "all" : monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{fmtMonth(m)}</SelectItem>)}
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
            columns.map((column) => ({ key: column.key, label: column.label })),
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

      <div className="card-glass overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 880 }}>
            {/* Header */}
            <div
              className="grid bg-primary text-primary-foreground text-[12px] font-semibold sticky top-0 z-10"
              style={{ gridTemplateColumns: INV_GRID_COLS }}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={`cursor-pointer select-none px-3 py-2.5 font-semibold flex items-center ${column.align === "right" ? "justify-end" : ""}`}
                  onClick={(e) => toggleSort(column.key, e.shiftKey)}
                  title="Click to sort. Shift+click to add another column."
                >
                  <span className="flex items-center gap-1">{column.label}<SortIcon col={column.key} /></span>
                </div>
              ))}
              <div className="px-3 py-2.5"></div>
            </div>

            {/* Virtualized body */}
            <InvoiceVirtualBody
              filtered={filtered}
              openDetail={openDetail}
              openAttachmentViewer={openAttachmentViewer}
              setDeletingId={setDeletingId}
              setDeleteOpen={setDeleteOpen}
            />

            {/* Footer */}
            {filtered.length > 0 && (
              <div
                className="grid bg-muted/40 text-[12px] font-semibold border-t border-border"
                style={{ gridTemplateColumns: INV_GRID_COLS }}
              >
                <div className="px-3 py-2 text-right" style={{ gridColumn: "span 5" }}>Total</div>
                <div className="px-3 py-2 text-right tabular-nums">{fmt(totalAmount)}</div>
                <div></div>
                <div></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Invoice {selectedInvoice.invoice_number}
                  <Badge className={`text-[10px] ${STATUS_COLORS[selectedInvoice.status] || ""}`}>{selectedInvoice.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
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

                {selectedInvoice.verified_at && (
                  <div className="text-xs text-muted-foreground">Verified: {new Date(selectedInvoice.verified_at).toLocaleString()}</div>
                )}
                {selectedInvoice.approved_at && (
                  <div className="text-xs text-muted-foreground">Approved: {new Date(selectedInvoice.approved_at).toLocaleString()}</div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {selectedInvoice.status === "pending" && (
                    <Button size="sm" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "verified", { verified_by: user?.id, verified_at: new Date().toISOString() }); setDrawerOpen(false); }}>✓ Verify</Button>
                  )}
                  {selectedInvoice.status === "verified" && (
                    <>
                      <Button size="sm" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "approved", { approved_by: user?.id, approved_at: new Date().toISOString() }); setDrawerOpen(false); }}>✓ Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "pending", { verified_by: null, verified_at: null } as any); setDrawerOpen(false); }}>Revert to Pending</Button>
                    </>
                  )}
                  {selectedInvoice.status === "approved" && (
                    <Button size="sm" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "paid"); setDrawerOpen(false); }}>Mark Paid</Button>
                  )}
                  {!["overdue", "cancelled"].includes(selectedInvoice.status) && (
                    <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "overdue"); setDrawerOpen(false); }}>Mark Overdue</Button>
                  )}
                  {selectedInvoice.status !== "cancelled" && (
                    <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "cancelled"); setDrawerOpen(false); }}>Cancel</Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => { setDrawerOpen(false); setDeletingId(selectedInvoice.id); setDeleteOpen(true); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                  </Button>
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

                <h4 className="pt-2 text-sm font-semibold">Line Items ({lineItems.length})</h4>
                <div className="space-y-1">
                  {lineItems.map((line, index) => (
                    <div key={line.id} className={`grid grid-cols-[1fr_60px_80px_80px] gap-2 rounded px-2 py-1.5 text-xs ${index % 2 === 0 ? "bg-muted/30" : ""}`}>
                      <div>
                        <span className="font-medium">{line.description}</span>
                        {line.pack_size && <span className="ml-1 text-muted-foreground">[{line.pack_size}]</span>}
                      </div>
                      <div className="text-right tabular-nums">{line.quantity}</div>
                      <div className="text-right tabular-nums">{fmt(line.unit_price)}</div>
                      <div className="text-right tabular-nums font-medium">{fmt(line.total)}</div>
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

// ----- Virtualized invoice rows ----------------------------------
interface InvoiceVirtualBodyProps {
  filtered: Invoice[];
  openDetail: (inv: Invoice) => void;
  openAttachmentViewer: (fileUrl: string, invoiceNumber: string) => void;
  setDeletingId: (id: string) => void;
  setDeleteOpen: (open: boolean) => void;
}

function InvoiceVirtualBody({ filtered, openDetail, openAttachmentViewer, setDeletingId, setDeleteOpen }: InvoiceVirtualBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });
  const items = rowVirtualizer.getVirtualItems();

  return (
    <div ref={scrollRef} className="overflow-auto" style={{ height: "calc(100vh - 360px)", minHeight: 420 }}>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No invoices found. Upload your first invoice above.</div>
      ) : (
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {items.map((vRow) => {
            const inv = filtered[vRow.index];
            const idx = vRow.index;
            return (
              <div
                key={inv.id}
                className={`grid items-center cursor-pointer border-b border-border/40 transition-colors hover:bg-accent/30 text-[12px] ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                style={{
                  gridTemplateColumns: INV_GRID_COLS,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vRow.size,
                  transform: `translateY(${vRow.start}px)`,
                }}
                onClick={() => openDetail(inv)}
              >
                <div className="whitespace-nowrap px-3 text-muted-foreground">{fmtDate(inv.invoice_date)}</div>
                <div className="px-3 font-mono font-medium text-primary truncate">{inv.invoice_number}</div>
                <div className="px-3 font-medium text-foreground truncate">{inv.supplier_name}</div>
                <div className="px-3 truncate">{inv.venue}</div>
                <div className="whitespace-nowrap px-3 text-muted-foreground">{fmtDate(inv.due_date || "")}</div>
                <div className="px-3 text-right font-semibold tabular-nums">{fmtForSupplier(Number(inv.total_amount), inv.supplier_name)}</div>
                <div className="px-3">
                  <Badge className={`px-1.5 py-0 text-[10px] ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</Badge>
                </div>
                <div className="px-3">
                  <div className="flex gap-1">
                    {inv.file_url && (
                      <button onClick={(e) => { e.stopPropagation(); openAttachmentViewer(inv.file_url!, inv.invoice_number); }} className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground" title="View attachments">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setDeletingId(inv.id); setDeleteOpen(true); }} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
