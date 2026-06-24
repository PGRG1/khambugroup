import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { autoCreateGrnFromInvoice } from "@/utils/autoCreateGrnFromInvoice";
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
import { Search, Trash2, ScanLine, Pencil, Eye, ArrowUpDown, ArrowUp, ArrowDown, X, Download, Plus, AlertTriangle, FileText, Clock, CheckCircle2, Copy as CopyIcon, DollarSign, Sparkles, MessageSquareWarning } from "lucide-react";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import { DisputeConfirmDialog, type DisputedLineSummary } from "@/components/invoices/DisputeConfirmDialog";
import VoidInvoiceDialog from "@/components/invoices/VoidInvoiceDialog";
import ProductAutocomplete from "@/components/invoices/ProductAutocomplete";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import { getRoundingMode, roundLineTotal, formatLineTotal, aggregateTotal, recalcAllDiscounts, normalizeDiscountMode, type RoundingMode, type DiscountMode } from "@/utils/invoiceRounding";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { DataTableShell, usePagination, type FilterField } from "@/components/common/data-table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BaniScanSummary } from "@/components/invoices/ai/BaniScanSummary";
import { runBaniScan } from "@/lib/baniRunScan";
import { useActiveTenant } from "@/hooks/useActiveTenant";

const STATUSES = ["pending", "verified", "approved", "paid", "unpaid", "overdue", "cancelled", "disputed", "voided"];
const REVIEW_STATUSES = ["Approved", "Rejected", "Under Review", "Disputed"] as const;
const EXCEPTION_NOTES = ["Credit Note Issued", "Voided", "-"] as const;

const REVIEW_BADGE: Record<string, string> = {
  "Approved": "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  "Rejected": "bg-red-500/15 text-red-300 border border-red-500/30",
  "Under Review": "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  "Disputed": "bg-orange-500/15 text-orange-300 border border-orange-500/30",
};

const EXCEPTION_BADGE: Record<string, string> = {
  "Credit Note Issued": "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  "Voided": "bg-zinc-700/30 text-zinc-400 border border-zinc-600/30",
  "-": "bg-transparent text-muted-foreground",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
  verified: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  paid: "bg-emerald-600/20 text-emerald-200 border border-emerald-600/40",
  unpaid: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
  overdue: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  cancelled: "bg-zinc-700/30 text-zinc-400 border border-zinc-600/30 line-through",
  disputed: "bg-red-500/15 text-red-300 border border-red-500/30",
  voided: "bg-zinc-700/30 text-zinc-400 border border-zinc-600/30",
};

const isVoidEligible = (inv: Pick<Invoice, "status" | "approved_at">) => {
  const s = (inv.status || "").toLowerCase();
  if (s === "paid" || s === "voided" || s === "approved") return false;
  if (inv.approved_at) return false;
  return true;
};

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800 border-green-300",
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRound = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtForMode = (n: number, mode: RoundingMode) =>
  mode === "integer" ? fmtRound(n) : fmt(n);
const fmtForSupplier = (n: number, supplierName?: string) =>
  fmtForMode(n, getRoundingMode({ name: supplierName }));
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
  discount_mode: DiscountMode;
  discount_rate: string;
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
  accepted_qty: string;
  accepted_qty_touched: boolean;
  receiving_reason: string;
  receiving_note: string;
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
  discount_mode: "fixed",
  discount_rate: "0",
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
  accepted_qty: "1",
  accepted_qty_touched: false,
  receiving_reason: "matched",
  receiving_note: "",
};

const RECEIVING_REASONS: { value: string; label: string }[] = [
  { value: "short_delivery", label: "Short delivery" },
  { value: "partial_delivery", label: "Partial delivery" },
  { value: "not_received", label: "Not received" },
  { value: "damaged", label: "Damaged" },
  { value: "broken", label: "Broken" },
  { value: "poor_quality", label: "Poor quality" },
  { value: "rejected", label: "Rejected" },
  { value: "extra_quantity_received", label: "Extra quantity received" },
  { value: "free_promotional_quantity", label: "Free promotional quantity" },
  { value: "supplier_over_delivery", label: "Supplier over-delivery" },
  { value: "substitution_accepted", label: "Substitution accepted" },
  { value: "wrong_item_received", label: "Wrong item received" },
  { value: "new_item_received", label: "New item received" },
  { value: "other", label: "Other" },
];

const NEGATIVE_AMBER_REASONS = new Set(["short_delivery", "partial_delivery", "not_received"]);
const NEGATIVE_RED_REASONS = new Set(["damaged", "broken", "poor_quality", "rejected", "wrong_item_received"]);
const POSITIVE_GREEN_REASONS = new Set(["extra_quantity_received", "free_promotional_quantity", "supplier_over_delivery"]);

function computeEditReceivingTint(line: EditableInvoiceLine): { bg: string; border: string } | null {
  const qty = parseFloat(line.quantity) || 0;
  const acc = parseFloat(line.accepted_qty ?? line.quantity) || 0;
  const diff = acc - qty;
  if (diff === 0) return null;
  const reason = line.receiving_reason || "";
  if (diff < 0 && NEGATIVE_RED_REASONS.has(reason)) {
    return { bg: "rgba(239, 68, 68, 0.10)", border: "rgba(239, 68, 68, 0.35)" };
  }
  if (diff > 0 && POSITIVE_GREEN_REASONS.has(reason)) {
    return { bg: "rgba(34, 197, 94, 0.10)", border: "rgba(34, 197, 94, 0.35)" };
  }
  return { bg: "rgba(251, 191, 36, 0.10)", border: "rgba(251, 191, 36, 0.35)" };
}


export default function ProcurementInvoicesTab() {
  const { invoices, suppliers, loading, fetchAll, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus } = useInvoiceData();
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();


  const [productMaster, setProductMaster] = useState<ProductMasterEntry[]>([]);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");
  const [exceptionNoteFilter, setExceptionNoteFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState<string>("__latest__");
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ key: "invoice_date", dir: "desc" }]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (searchParams.get("scan") === "1") {
      setScannerOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("scan");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Invoice>>({});
  const [editLines, setEditLines] = useState<EditableInvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [grnItemsForInvoice, setGrnItemsForInvoice] = useState<any[]>([]);
  const [invoiceVarianceMap, setInvoiceVarianceMap] = useState<Record<string, boolean>>({});

  const batchFileRef = useRef<{ size: number; url: string; name: string } | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  // Dispute confirmation modal for the editor flow.
  const [editDisputeOpen, setEditDisputeOpen] = useState(false);
  const [editDisputePayload, setEditDisputePayload] = useState<{ lines: DisputedLineSummary[]; amount: number } | null>(null);

  // Void invoice flow.
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState(false);

  // Hide voided invoices by default; toggle to surface them.
  const [showVoided, setShowVoided] = useState(false);

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
      // Hide voided unless the toggle is on or the status filter explicitly selects voided.
      if (!showVoided && (inv.status || "").toLowerCase() === "voided" && statusFilter !== "voided") return false;
      if (supplierFilter !== "all" && inv.supplier_id !== supplierFilter) return false;
      if (venueFilter !== "all" && inv.venue !== venueFilter) return false;
      if (statusFilter === "__disputed__") {
        if (!(inv as any).has_disputes) return false;
      } else if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (reviewStatusFilter !== "all" && (inv.review_status || "Under Review") !== reviewStatusFilter) return false;
      if (exceptionNoteFilter !== "all" && (inv.exception_note || "-") !== exceptionNoteFilter) return false;
      if (monthFilter !== "all" && monthFilter !== "__latest__" && (!inv.invoice_date || !inv.invoice_date.startsWith(monthFilter))) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q) || (inv.supplier_name || "").toLowerCase().includes(q);
    });

    return sortRows(result, sortColumns);
  }, [invoices, supplierFilter, venueFilter, statusFilter, reviewStatusFilter, exceptionNoteFilter, monthFilter, search, sortColumns, showVoided]);

  // KPI computation across FILTERED invoices — reflects active filters
  const kpis = useMemo(() => {
    const total = filtered.length;
    let underReview = 0, approved = 0, exceptions = 0, disputed = 0;
    let totalValue = 0;
    const dupKey = new Map<string, number>();
    for (const inv of filtered) {
      const rs = inv.review_status || "Under Review";
      if (rs === "Under Review") underReview++;
      if (rs === "Approved") approved++;
      if (rs === "Disputed") disputed++;
      const en = inv.exception_note || "-";
      if (en !== "-" || rs === "Rejected") exceptions++;
      totalValue += Number(inv.total_amount) || 0;
      const k = `${inv.supplier_id}::${(inv.invoice_number || "").trim().toLowerCase()}`;
      if (k.trim() !== "::") dupKey.set(k, (dupKey.get(k) || 0) + 1);
    }
    let duplicates = 0;
    for (const v of dupKey.values()) if (v > 1) duplicates += v;
    const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%";
    return { total, underReview, approved, exceptions, disputed, duplicates, totalValue, pct };
  }, [filtered]);

  const columns = [
    { key: "invoice_date", label: "Date", w: "w-[100px]" },
    { key: "invoice_number", label: "Invoice #", w: "w-[120px]" },
    { key: "supplier_name", label: "Supplier & Vendor", w: "min-w-[160px]" },
    { key: "venue", label: "Venue", w: "w-[90px]" },
    { key: "due_date", label: "Due Date", w: "w-[100px]" },
    { key: "total_amount", label: "Amount", w: "w-[110px]", align: "right" as const },
    { key: "status", label: "Payment Status", w: "w-[110px]" },
    { key: "review_status", label: "Review Status", w: "w-[130px]" },
    { key: "exception_note", label: "Issue / Exception", w: "w-[150px]" },
  ];

  const totalAmount = filtered.reduce((s, inv) => s + Number(inv.total_amount), 0);

  const getSupplierNameById = (supplierId?: string | null) => {
    if (!supplierId) return "";
    return suppliers.find((supplier) => supplier.id === supplierId)?.name || "";
  };

  const getModeForSupplier = (supplierId?: string | null, fallbackName?: string | null): RoundingMode => {
    const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : undefined;
    return getRoundingMode(supplier ?? { name: fallbackName ?? "" }, fallbackName);
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

  const calculateEditLineTotal = (line: Pick<EditableInvoiceLine, "quantity" | "unit_price" | "discount" | "tax_amount"> & Partial<Pick<EditableInvoiceLine, "discount_mode" | "discount_rate">>, supplierName?: string, supplierId?: string | null) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const tax = parseFloat(line.tax_amount) || 0;
    const dMode = normalizeDiscountMode(line.discount_mode);
    const rate = parseFloat(line.discount_rate || "0") || 0;
    const fixed = parseFloat(line.discount) || 0;
    const gross = qty * price;
    const disc = dMode === "percentage"
      ? Math.max(0, (gross * Math.max(0, Math.min(100, rate))) / 100)
      : Math.max(0, fixed);
    const raw = gross - disc + tax;
    return formatLineTotal(raw, getModeForSupplier(supplierId, supplierName));
  };

  const hydrateEditLine = (line: Partial<InvoiceLineItem> | EditableInvoiceLine, supplierId?: string | null): EditableInvoiceLine => {
    const matchedProduct = findProductMatch(line, supplierId);
    const currentPrice = parseFloat(String(line.unit_price ?? 0)) || 0;
    const pmPrice = matchedProduct?.purchase_unit_cost;
    const supplierName = getSupplierNameById(supplierId || null) || "";
    const mode = getModeForSupplier(supplierId, supplierName);
    const recalcLineTotal = mode !== "sum_then_round"; // for integer or round_then_sum, line totals are derived

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
    const computedTotal = calculateEditLineTotal({ quantity: qtyStr, unit_price: priceStr, discount: discStr, tax_amount: taxStr }, supplierName, supplierId);

    // PM is the source of truth for External SKU when a supplier-scoped product is matched.
    // Empty PM SKU must stay empty — never fall back to the scanned/typed code.
    const resolvedItemCode = matchedProduct
      ? (matchedProduct.external_sku ?? "")
      : (line.item_code || "");

    const qtyNum = parseFloat(qtyStr) || 0;
    const savedAccepted = (line as any).accepted_qty;
    const acceptedStr = savedAccepted != null && savedAccepted !== ""
      ? String(savedAccepted)
      : qtyStr;
    const acceptedNum = parseFloat(acceptedStr) || 0;
    const diff = acceptedNum - qtyNum;
    const savedReason = (line as any).receiving_reason as string | null | undefined;
    const receivingReason = savedReason || (diff === 0 ? "matched" : "");
    const receivingNote = ((line as any).receiving_note as string | null | undefined) || "";

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
      discount_mode: normalizeDiscountMode((line as any).discount_mode),
      discount_rate: String((line as any).discount_rate ?? "0"),
      tax_amount: taxStr,
      total: recalcLineTotal
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
      accepted_qty: acceptedStr,
      accepted_qty_touched: savedAccepted != null,
      receiving_reason: receivingReason,
      receiving_note: receivingNote,
    };
  };

  const openDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    const items = await fetchLineItems(inv.id);
    setLineItems(items);
    // Load GRN items linked to this invoice (from confirmed GRNs only)
    const { data: grnRows } = await supabase
      .from("goods_received_notes" as any)
      .select("id, status")
      .eq("invoice_id", inv.id)
      .eq("status", "confirmed");
    const grnIds = ((grnRows ?? []) as any[]).map((g) => g.id);
    if (grnIds.length > 0) {
      const { data: giData } = await supabase
        .from("grn_items" as any)
        .select("*")
        .in("grn_id", grnIds);
      setGrnItemsForInvoice((giData ?? []) as any[]);
    } else {
      setGrnItemsForInvoice([]);
    }
    setEditing(false);
    setDrawerOpen(true);
  };

  // Load variance map for invoice list badges
  useEffect(() => {
    (async () => {
      const { data: grnRows } = await supabase
        .from("goods_received_notes" as any)
        .select("id, invoice_id")
        .eq("status", "confirmed")
        .not("invoice_id", "is", null);
      const rows = (grnRows ?? []) as any[];
      if (rows.length === 0) { setInvoiceVarianceMap({}); return; }
      const grnIdToInv: Record<string, string> = {};
      for (const r of rows) grnIdToInv[r.id] = r.invoice_id;
      const { data: gi } = await supabase
        .from("grn_items" as any)
        .select("grn_id, invoice_line_item_id, quantity_received")
        .in("grn_id", Object.keys(grnIdToInv));
      const grnItems = (gi ?? []) as any[];
      // Need invoice line item quantities
      const lineIds = grnItems.map((x) => x.invoice_line_item_id).filter(Boolean);
      if (lineIds.length === 0) { setInvoiceVarianceMap({}); return; }
      const { data: lines } = await supabase
        .from("invoice_line_items")
        .select("id, quantity")
        .in("id", lineIds);
      const qtyMap = new Map<string, number>();
      for (const l of (lines ?? []) as any[]) qtyMap.set(l.id, Number(l.quantity));
      const variance: Record<string, boolean> = {};
      for (const item of grnItems) {
        if (!item.invoice_line_item_id) continue;
        const invQty = qtyMap.get(item.invoice_line_item_id);
        if (invQty == null) continue;
        if (Math.abs(Number(item.quantity_received) - invQty) > 0.001) {
          const invId = grnIdToInv[item.grn_id];
          if (invId) variance[invId] = true;
        }
      }
      setInvoiceVarianceMap(variance);
    })();
  }, [invoices.length]);

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
      discount: selectedInvoice.discount ?? 0,
      discount_type: (selectedInvoice as any).discount_type === "refund" ? "refund" : "discount",
      discount_mode: normalizeDiscountMode((selectedInvoice as any).discount_mode) as any,
      discount_rate: Number((selectedInvoice as any).discount_rate ?? 0) as any,
    } as any);
    setEditLines(lineItems.map((line) => hydrateEditLine(line, selectedInvoice.supplier_id)));
    setDrawerOpen(false);
    setEditing(true);
  };

  useEffect(() => {
    if (!editing || !selectedInvoice) return;
    const supplierId = editForm.supplier_id || selectedInvoice.supplier_id;
    setEditLines((prev) => prev.map((line) => hydrateEditLine(line, supplierId)));
  }, [editing, productMaster, editForm.supplier_id, selectedInvoice]);

  const computeEditDisputeSummary = (): { lines: DisputedLineSummary[]; amount: number } => {
    const out: DisputedLineSummary[] = [];
    let amount = 0;
    for (const l of editLines) {
      if (!l.description.trim()) continue;
      const qty = parseFloat(l.quantity) || 0;
      const acc = parseFloat(l.accepted_qty ?? l.quantity ?? "0") || 0;
      if (acc >= qty) continue;
      const price = parseFloat(l.unit_price) || 0;
      const variance = (price * qty) - (price * acc);
      amount += variance;
      out.push({
        description: l.description,
        invPrice: price,
        accPrice: price,
        invQty: qty,
        accQty: acc,
        unit: l.matched_purchase_uom || l.unit || null,
        variance,
      });
    }
    return { lines: out, amount };
  };

  const handleSaveEdit = async (opts: { forceDispute?: boolean } = {}) => {
    if (!selectedInvoice) return;

    // Intercept disputes for the editor flow.
    if (!opts.forceDispute) {
      const summary = computeEditDisputeSummary();
      if (summary.lines.length > 0) {
        setEditDisputePayload(summary);
        setEditDisputeOpen(true);
        return;
      }
    }
    const summary = opts.forceDispute ? computeEditDisputeSummary() : { lines: [], amount: 0 };


    setSaving(true);

    const supplierIdForSave = editForm.supplier_id || selectedInvoice.supplier_id;
    const supplierNameForSave = getSupplierNameById(supplierIdForSave) || selectedInvoice.supplier_name || "";
    const modeForSave = getModeForSupplier(supplierIdForSave, supplierNameForSave);

    const filteredLines = editLines.filter((line) => line.description.trim());
    const headerMode = normalizeDiscountMode((editForm as any).discount_mode);
    const headerRate = Number((editForm as any).discount_rate ?? 0) || 0;
    const headerFixed = Number((editForm as any).discount ?? 0) || 0;
    const discResults = recalcAllDiscounts(
      filteredLines.map((l) => ({
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_mode: l.discount_mode,
        discount_rate: l.discount_rate || "0",
        discount: l.discount || "0",
      })),
      headerMode,
      headerRate,
      headerFixed,
      modeForSave,
    );

    const mappedLines = filteredLines.map((line, idx) => {
      const qty = parseFloat(line.quantity) || 0;
      const acc = parseFloat(line.accepted_qty ?? line.quantity) || 0;
      const qtyDiff = acc - qty;
      const recvReason = qtyDiff === 0 ? "matched" : (line.receiving_reason || null);
      const recvNote = (line.receiving_note || "").trim() || null;
      const out = discResults.perLine[idx];
      return {
        item_code: line.item_code || "",
        description: line.description,
        pack_size: line.pack_size || "",
        category_id: null,
        quantity: qty,
        unit: line.unit || null,
        weight: line.weight ? parseFloat(line.weight) || 0 : null,
        unit_price: parseFloat(line.unit_price) || 0,
        discount: out.line_discount_amount,
        discount_mode: line.discount_mode,
        discount_rate: parseFloat(line.discount_rate || "0") || 0,
        line_discount_amount: out.line_discount_amount,
        header_discount_share: out.header_discount_share,
        net_unit_cost: out.net_unit_cost,
        tax_amount: parseFloat(line.tax_amount) || 0,
        total: parseFloat(out.total) || 0,
        notes: null,
        product_master_id: line.product_master_id,
        accepted_qty: acc,
        qty_difference: qtyDiff,
        receiving_reason: recvReason,
        receiving_note: recvNote,
      } as any;
    });

    const rawLines = filteredLines.map((line, idx) => {
      const qty = parseFloat(line.quantity) || 0;
      const price = parseFloat(line.unit_price) || 0;
      const tax = parseFloat(line.tax_amount) || 0;
      const out = discResults.perLine[idx];
      return { gross: (qty * price) - out.line_discount_amount - out.header_discount_share + tax, tax };
    });
    const taxSum = rawLines.reduce((s, l) => s + l.tax, 0);
    const grossTotal = aggregateTotal(rawLines.map((l) => l.gross), modeForSave);
    const subtotalAmount = aggregateTotal(rawLines.map((l) => l.gross - l.tax), modeForSave);
    const totalAmount = grossTotal;

    const hasDisputes = summary.lines.length > 0;
    const statusForSave = hasDisputes ? "disputed" : (editForm.status || selectedInvoice.status);

    const success = await updateInvoice(
      selectedInvoice.id,
      {
        ...editForm,
        status: statusForSave,
        discount: discResults.headerDiscountAmount,
        discount_mode: headerMode,
        discount_rate: headerRate,
        subtotal: subtotalAmount,
        tax_amount: taxSum,
        total_amount: totalAmount,
        has_disputes: hasDisputes,
        disputed_amount: summary.amount,
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
      const nextLine: EditableInvoiceLine = { ...updated[idx], [field]: value as any };

      if (["quantity", "unit_price", "discount", "discount_mode", "discount_rate", "tax_amount"].includes(field)) {
        const supplierId = editForm.supplier_id || selectedInvoice?.supplier_id || null;
        const supplierName = getSupplierNameById(supplierId) || selectedInvoice?.supplier_name || "";
        nextLine.total = calculateEditLineTotal(nextLine, supplierName, supplierId);
      }

      if (field === "quantity") {
        if (!nextLine.accepted_qty_touched) {
          nextLine.accepted_qty = value;
        }
        const q = parseFloat(value) || 0;
        const a = parseFloat(nextLine.accepted_qty ?? value) || 0;
        if (a - q === 0) {
          nextLine.receiving_reason = "matched";
        } else if (nextLine.receiving_reason === "matched" || !nextLine.receiving_reason) {
          nextLine.receiving_reason = "";
        }
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

  const updateEditLineReceiving = (idx: number, field: "accepted_qty" | "receiving_reason" | "receiving_note", value: string) => {
    setEditLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[idx] };
      if (field === "accepted_qty") {
        line.accepted_qty = value;
        line.accepted_qty_touched = true;
        const q = parseFloat(line.quantity) || 0;
        const a = parseFloat(value) || 0;
        if (a - q === 0) {
          line.receiving_reason = "matched";
        } else if (line.receiving_reason === "matched" || !line.receiving_reason) {
          line.receiving_reason = "";
        }
      } else if (field === "receiving_reason") {
        line.receiving_reason = value;
      } else {
        line.receiving_note = value;
      }
      updated[idx] = line;
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

  // Apply each supplier's invoice rounding rule (configured in Suppliers & Vendors).
  const editSupplierIdForTotal = editForm.supplier_id || selectedInvoice?.supplier_id || null;
  const editSupplierNameForTotal = getSupplierNameById(editSupplierIdForTotal) || selectedInvoice?.supplier_name || "";
  const editMode = getModeForSupplier(editSupplierIdForTotal, editSupplierNameForTotal);
  const editRawLines = editLines.map((line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unit_price) || 0;
    const discount = parseFloat(line.discount) || 0;
    const tax = parseFloat(line.tax_amount) || 0;
    return { gross: (qty * price) - discount + tax, tax };
  });
  const editTaxSum = editRawLines.reduce((s, l) => s + l.tax, 0);
  const editTotal = aggregateTotal(editRawLines.map((l) => l.gross), editMode);
  const editSubtotal = aggregateTotal(editRawLines.map((l) => l.gross - l.tax), editMode);
  const unmatchedCount = editLines.filter((line) => line.unmatched && line.description.trim()).length;
  const priceChangedCount = editLines.filter((line) => line.price_changed).length;

  // GRN dispute stats: any line whose accepted_qty differs from quantity is disputed.
  const editDisputeStats = useMemo(() => {
    let disputedLines = 0;
    let missingReason = 0;
    let missingNote = 0;
    for (const l of editLines) {
      const q = parseFloat(l.quantity) || 0;
      const a = parseFloat(l.accepted_qty ?? l.quantity ?? "0") || 0;
      if (a - q !== 0) {
        disputedLines += 1;
        if (!l.receiving_reason) missingReason += 1;
        if (l.receiving_reason === "other" && !(l.receiving_note || "").trim()) missingNote += 1;
      }
    }
    return { disputedLines, missingReason, missingNote, hasDispute: disputedLines > 0 };
  }, [editLines]);

  const previousStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editing) return;
    if (editDisputeStats.hasDispute) {
      if (editForm.status !== "disputed") {
        previousStatusRef.current = (editForm.status as string) || null;
        setEditForm((f) => ({ ...f, status: "disputed" }));
      }
    } else if (editForm.status === "disputed") {
      const restore = previousStatusRef.current || "unpaid";
      previousStatusRef.current = null;
      setEditForm((f) => ({ ...f, status: restore }));
    }
  }, [editing, editDisputeStats.hasDispute]);


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
            <Button
              onClick={() => handleSaveEdit()}
              disabled={
                saving ||
                !editForm.supplier_id ||
                !editForm.invoice_number ||
                !editForm.invoice_date ||
                editDisputeStats.missingReason > 0 ||
                editDisputeStats.missingNote > 0
              }
            >
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
            <div className="md:col-span-2 xl:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm((form) => ({ ...form, notes: e.target.value }))} className="min-h-[42px]" rows={1} />
            </div>
          </div>

          {unmatchedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><strong>{unmatchedCount} item(s) not matched to Bills & Invoices</strong> — use autocomplete to match.</span>
            </div>
          )}

          {priceChangedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-accent/40 p-3 text-sm text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
              <span><strong>{priceChangedCount} price change(s) detected</strong> — invoice prices differ from Bills & Invoices.</span>
            </div>
          )}

          {editDisputeStats.hasDispute && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Quantity differences logged — set a reason for each disputed line so the discrepancy can be followed up. You can still save the invoice.</span>
            </div>
          )}

          <h4 className="text-sm font-semibold">Line Items ({editLines.length})</h4>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[1810px] border-collapse text-xs">
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
                  <th className="w-[90px] px-1 py-1.5 text-left font-medium text-muted-foreground">Accepted Qty</th>
                  <th className="w-[80px] px-1 py-1.5 text-left font-medium text-muted-foreground">Difference</th>
                  <th className="w-[160px] px-1 py-1.5 text-left font-medium text-muted-foreground">Reason</th>
                  <th className="w-[140px] px-1 py-1.5 text-left font-medium text-muted-foreground">Note</th>
                  <th className="w-[95px] px-1 py-1.5 text-left font-medium text-muted-foreground">Purch. Cost</th>
                  <th className="w-[140px] px-1 py-1.5 text-left font-medium text-muted-foreground">Discount</th>
                  <th className="w-[100px] px-1 py-1.5 text-right font-medium text-muted-foreground">Invoiced Amount</th>
                  <th className="w-[100px] px-1 py-1.5 text-right font-medium text-muted-foreground">Accepted Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const hModeEdit = normalizeDiscountMode((editForm as any).discount_mode);
                  const hRateEdit = String((editForm as any).discount_rate ?? 0);
                  const hFixedEdit = String(editForm.discount ?? 0);
                  const editRecalc = recalcAllDiscounts(editLines as any, hModeEdit, hRateEdit, hFixedEdit, editMode);
                  const editRowAmounts = editLines.map((l, i) => {
                    const q = parseFloat(l.quantity) || 0;
                    const a = parseFloat(l.accepted_qty ?? l.quantity ?? "0") || 0;
                    const invoiced = parseFloat(editRecalc.perLine[i].total) || 0;
                    const accepted = q > 0 ? invoiced * (a / q) : 0;
                    return { invoiced, accepted };
                  });
                  return editLines.map((line, index) => {
                  const tint = computeEditReceivingTint(line);
                  const rowClass = !tint && line.unmatched && line.description.trim()
                    ? "bg-destructive/10 border-l-2 border-l-destructive"
                    : !tint && line.price_changed
                    ? "bg-accent/40 border-l-2 border-l-primary"
                    : "";
                  const rowStyle: React.CSSProperties | undefined = tint
                    ? { backgroundColor: tint.bg, borderLeft: `2px solid ${tint.border}` }
                    : undefined;
                  const qtyNum = parseFloat(line.quantity) || 0;
                  const accNum = parseFloat(line.accepted_qty ?? line.quantity ?? "0") || 0;
                  const diff = accNum - qtyNum;
                  const effReason = diff === 0 ? "matched" : (line.receiving_reason || "");
                  const noteRequired = effReason === "other" && !(line.receiving_note || "").trim();

                  return (
                    <tr key={line.id || index} className={`border-b border-border/50 ${rowClass}`} style={rowStyle}>
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
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.accepted_qty ?? ""}
                          onChange={(e) => updateEditLineReceiving(index, "accepted_qty", e.target.value)}
                          className="h-8 text-xs min-w-[90px]"
                        />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <div
                          className={`h-8 flex items-center justify-end px-2 font-mono text-xs rounded-md border border-input bg-muted/50 ${
                            diff === 0
                              ? "text-muted-foreground"
                              : diff < 0
                              ? "text-red-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : String(diff)}
                        </div>
                      </td>
                      <td className="px-1 py-1 align-top">
                        {diff === 0 ? (
                          <div className="h-8 flex items-center px-2 text-xs rounded-md border border-input bg-muted/50 text-muted-foreground">
                            Matched
                          </div>
                        ) : (
                          <div className="relative">
                            <select
                              value={line.receiving_reason || ""}
                              onChange={(e) => updateEditLineReceiving(index, "receiving_reason", e.target.value)}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="">Select reason…</option>
                              {RECEIVING_REASONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            {!line.receiving_reason && (
                              <span className="absolute top-1 right-6 h-1.5 w-1.5 rounded-full bg-red-500" />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1 align-top">
                        <div className="relative">
                          <Input
                            value={line.receiving_note || ""}
                            onChange={(e) => updateEditLineReceiving(index, "receiving_note", e.target.value)}
                            maxLength={500}
                            placeholder={effReason === "other" ? "Required" : "Optional"}
                            className="h-8 text-xs min-w-[140px]"
                          />
                          {noteRequired && (
                            <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-red-500" />
                          )}
                        </div>
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
                      {/* Discount (% or $) */}
                      <td className="px-1 py-1 align-top">
                        {(() => {
                          const dMode = normalizeDiscountMode(line.discount_mode);
                          const q = parseFloat(line.quantity) || 0;
                          const p = parseFloat(line.unit_price) || 0;
                          const rate = parseFloat(line.discount_rate || "0") || 0;
                          const fixed = parseFloat(line.discount || "0") || 0;
                          const calc = dMode === "percentage" ? (q * p * Math.max(0, Math.min(100, rate))) / 100 : Math.max(0, fixed);
                          return (
                            <div className="flex flex-col gap-0.5 min-w-[130px]">
                              <div className="flex items-center gap-1">
                                <div className="inline-flex rounded-md border border-input overflow-hidden h-7">
                                  <button
                                    type="button"
                                    className={`px-1.5 text-[10px] ${dMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                                    onClick={() => updateEditLine(index, "discount_mode", "percentage")}
                                  >%</button>
                                  <button
                                    type="button"
                                    className={`px-1.5 text-[10px] ${dMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                                    onClick={() => updateEditLine(index, "discount_mode", "fixed")}
                                  >$</button>
                                </div>
                                <Input
                                  type="number"
                                  value={dMode === "percentage" ? (line.discount_rate || "0") : (line.discount || "0")}
                                  onChange={(e) => updateEditLine(index, dMode === "percentage" ? "discount_rate" : "discount", e.target.value)}
                                  className="h-7 text-xs"
                                  placeholder="0"
                                />
                              </div>
                              {calc > 0 && (
                                <span className="text-[9px] text-muted-foreground font-mono">−${calc.toFixed(2)}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {(() => {
                        const inv = editRowAmounts[index].invoiced;
                        const acc = editRowAmounts[index].accepted;
                        const accCls = acc === inv ? "text-foreground" : acc < inv ? "text-red-400" : "text-emerald-400";
                        return (
                          <>
                            <td className="px-1 py-1 align-top">
                              <div className="h-8 flex items-center justify-end px-2 font-mono text-xs text-muted-foreground min-w-[100px]">
                                {inv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </td>
                            <td className="px-1 py-1 align-top">
                              <div className={`h-8 flex items-center justify-end px-2 font-mono text-xs font-medium min-w-[100px] ${accCls}`}>
                                {acc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </td>
                          </>
                        );
                      })()}
                      <td className="px-1 py-1 align-top">
                        {editLines.length > 1 && (
                          <Button size="icon" variant="ghost" onClick={() => removeEditLine(index)} className="h-8 w-8">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>

          <Button variant="outline" size="sm" onClick={addEditLine}>
            <Plus className="h-3 w-3 mr-1" />Add Line
          </Button>

          <div className="flex items-center justify-end gap-4 text-sm border-t pt-2 flex-wrap">
            {(() => {
              const hMode = normalizeDiscountMode((editForm as any).discount_mode);
              const subtotalAfterLine = editLines.reduce((s, l) => {
                const q = parseFloat(l.quantity) || 0;
                const p = parseFloat(l.unit_price) || 0;
                const dm = normalizeDiscountMode(l.discount_mode);
                const rate = parseFloat(l.discount_rate || "0") || 0;
                const fixed = parseFloat(l.discount || "0") || 0;
                const gross = q * p;
                const ld = dm === "percentage" ? (gross * Math.max(0, Math.min(100, rate))) / 100 : Math.max(0, fixed);
                return s + Math.max(0, gross - ld);
              }, 0);
              const rate = Number((editForm as any).discount_rate ?? 0) || 0;
              const fixedHdr = Number(editForm.discount ?? 0) || 0;
              const headerCalc = hMode === "percentage"
                ? (subtotalAfterLine * Math.max(0, Math.min(100, rate))) / 100
                : Math.max(0, fixedHdr);
              return (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">
                    {(editForm as any).discount_type === "refund" ? "Refund:" : "Discount:"}
                  </span>
                  <Select
                    value={(editForm as any).discount_type || "discount"}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, discount_type: v as any }))}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discount">Discount</SelectItem>
                      <SelectItem value="refund">Refund</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="inline-flex rounded-md border border-input overflow-hidden h-7">
                    <button
                      type="button"
                      className={`px-1.5 text-[10px] ${hMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                      onClick={() => setEditForm((f) => ({ ...f, discount_mode: "percentage" } as any))}
                    >%</button>
                    <button
                      type="button"
                      className={`px-1.5 text-[10px] ${hMode === "fixed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                      onClick={() => setEditForm((f) => ({ ...f, discount_mode: "fixed" } as any))}
                    >$</button>
                  </div>
                  <Input
                    type="number"
                    value={hMode === "percentage" ? String((editForm as any).discount_rate ?? 0) : String(editForm.discount ?? 0)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      if (hMode === "percentage") {
                        setEditForm((f) => ({ ...f, discount_rate: v } as any));
                      } else {
                        setEditForm((f) => ({ ...f, discount: v } as any));
                      }
                    }}
                    className="h-7 w-24 font-mono text-xs text-right"
                    placeholder="0.00"
                  />
                  <span className={`text-[10px] font-mono ${(editForm as any).discount_type === "refund" ? "text-amber-500" : "text-muted-foreground"}`}>
                    = ${headerCalc.toFixed(2)}
                  </span>
                </div>
              );
            })()}
            {(() => {
              const hMode = normalizeDiscountMode((editForm as any).discount_mode);
              const hRateStr = String((editForm as any).discount_rate ?? 0);
              const hFixedStr = String(editForm.discount ?? 0);
              const ftRecalc = recalcAllDiscounts(editLines as any, hMode, hRateStr, hFixedStr, editMode);
              let invSub = 0;
              let accSub = 0;
              editLines.forEach((l, i) => {
                const q = parseFloat(l.quantity) || 0;
                const a = parseFloat(l.accepted_qty ?? l.quantity ?? "0") || 0;
                const invoiced = parseFloat(ftRecalc.perLine[i].total) || 0;
                invSub += invoiced;
                accSub += q > 0 ? invoiced * (a / q) : 0;
              });
              const disputed = invSub - accSub;
              const accCls = accSub === invSub ? "text-foreground" : accSub < invSub ? "text-red-400" : "text-emerald-400";
              const docTotal = Number((editForm as any).total_amount ?? selectedInvoice?.total_amount ?? 0) || 0;
              const docDiff = invSub - docTotal;
              return (
                <>
                  <div>
                    <span className="text-muted-foreground">Invoiced subtotal: </span>
                    <span className="font-mono font-medium text-muted-foreground">{invSub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Accepted subtotal: </span>
                    <span className={`font-mono font-medium ${accCls}`}>{accSub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {Math.abs(disputed) > 0.001 && (
                    <div>
                      <span className="text-muted-foreground">Disputed: </span>
                      <span className="font-mono font-medium text-red-400">
                        {disputed > 0 ? "−" : "+"}{Math.abs(disputed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Doc total: </span>
                    <span className="font-mono font-bold">{docTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {Math.abs(docDiff) > 0.01 && (
                      <span className="ml-2 font-mono text-[10px] text-amber-500">
                        (recon Δ {docDiff > 0 ? "+" : "−"}{Math.abs(docDiff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
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
            const hasDisputes = !!(inv as any).has_disputes;
            const disputedAmount = Number((inv as any).disputed_amount || 0);
            const baseStatus = inv.status === "paid" ? "paid" : "unpaid";
            const statusForCreate = hasDisputes ? "disputed" : baseStatus;
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

            const created = await createInvoice(
              {
                ...inv,
                discount: inv.discount ?? 0,
                discount_type: (inv as any).discount_type === "refund" ? "refund" : "discount",
                status: statusForCreate,
                subtotal: lines.reduce((sum, line) => sum + line.total - line.tax_amount, 0),
                tax_amount: lines.reduce((sum, line) => sum + line.tax_amount, 0),
                total_amount: lines.reduce((sum, line) => sum + line.total, 0),
                entered_by: user?.id || "",
                has_disputes: hasDisputes,
                disputed_amount: disputedAmount,
              } as any,
              lines,
              fileUrl,
              fileName
            );
            // Auto-trigger Bani's post-scan analysis (non-blocking).
            if (created?.id && tenantId) {
              runBaniScan({ invoiceId: created.id, tenantId, force: true }).catch((e) =>
                console.warn("Bani auto-scan failed", e)
              );

              // Auto-create matching GRN from the scanner's receiving fields.
              const grnRes = await autoCreateGrnFromInvoice(created.id, {
                tenantId,
                userId: user?.id || "",
              });
              if (grnRes.error) {
                console.error("Auto-GRN creation failed:", grnRes.error);
                toast.error("Invoice confirmed, but GRN creation failed — see console.");
              } else if (!grnRes.skipped && grnRes.grn) {
                const grnNo = grnRes.grn.grn_number;
                const action = {
                  label: "View GRN",
                  onClick: () => navigate("/procurement/receiving"),
                };
                if (grnRes.disputed) {
                  toast.warning(
                    `Invoice confirmed with disputes. GRN ${grnNo} created — review disputed lines.`,
                    { action }
                  );
                } else {
                  toast.success(
                    `Invoice confirmed. GRN ${grnNo} created and posted to inventory.`,
                    { action }
                  );
                }
              }
            }
          }}
          onClose={() => {
            setScannerOpen(false);
            batchFileRef.current = null;
          }}
          userId={user?.id || ""}
        />
      )}

      <InvoiceTableSection
        filtered={filtered}
        invoices={invoices}
        suppliers={suppliers}
        kpis={kpis}
        totalAmount={totalAmount}
        columns={columns}
        sortColumns={sortColumns}
        toggleSort={toggleSort}
        SortIcon={SortIcon}
        search={search}
        setSearch={setSearch}
        supplierFilter={supplierFilter}
        setSupplierFilter={setSupplierFilter}
        venueFilter={venueFilter}
        setVenueFilter={setVenueFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        reviewStatusFilter={reviewStatusFilter}
        setReviewStatusFilter={setReviewStatusFilter}
        exceptionNoteFilter={exceptionNoteFilter}
        setExceptionNoteFilter={setExceptionNoteFilter}
        monthFilter={monthFilter === "__latest__" ? "all" : monthFilter}
        setMonthFilter={setMonthFilter}
        months={months}
        fmtMonth={fmtMonth}
        openDetail={openDetail}
        openAttachmentViewer={openAttachmentViewer}
        setDeletingId={setDeletingId}
        setDeleteOpen={setDeleteOpen}
        onUpdateField={(id, patch) => updateInvoice(id, patch as any)}
        onUploadClick={() => setScannerOpen(true)}
        invoiceVarianceMap={invoiceVarianceMap}
      />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Invoice {selectedInvoice.invoice_number}
                  {selectedInvoice.status === "paid" && (
                    <Badge className={`text-[10px] ${STATUS_COLORS.paid}`}>paid</Badge>
                  )}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <Button size="sm" variant="outline" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit Invoice
                </Button>

                <BaniScanSummary invoiceId={selectedInvoice.id} />

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
                  {selectedInvoice.status !== "paid" ? (
                    <Button size="sm" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "paid"); setDrawerOpen(false); }}>Mark Paid</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "unpaid"); setDrawerOpen(false); }}>Mark Unpaid</Button>
                  )}
                  {isVoidEligible(selectedInvoice) && (
                    <Button size="sm" variant="outline" className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10" onClick={() => { setVoidTarget(selectedInvoice); setDrawerOpen(false); setVoidOpen(true); }}>
                      Void
                    </Button>
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

                {grnItemsForInvoice.length > 0 && (() => {
                  const giByLine = new Map<string, any>();
                  for (const gi of grnItemsForInvoice) {
                    if (gi.invoice_line_item_id) giByLine.set(gi.invoice_line_item_id, gi);
                  }
                  let totalInv = 0, totalRecv = 0;
                  const rows = lineItems.map((line) => {
                    const gi = giByLine.get(line.id);
                    const recvQty = gi ? Number(gi.quantity_received) : null;
                    const invQty = Number(line.quantity);
                    const variance = recvQty != null ? recvQty - invQty : null;
                    totalInv += invQty * Number(line.unit_price);
                    if (recvQty != null) totalRecv += recvQty * Number(line.unit_price);
                    return { line, gi, recvQty, invQty, variance };
                  });
                  const hasVariance = rows.some((r) => r.variance != null && Math.abs(r.variance) > 0.001);
                  return (
                    <div className="pt-2 space-y-2">
                      <h4 className="text-sm font-semibold">GRN Match</h4>
                      {hasVariance && (
                        <div className="text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded p-2">
                          Quantity discrepancy — review before approving payment.
                        </div>
                      )}
                      <div className="border border-border rounded overflow-hidden text-xs">
                        <table className="w-full">
                          <thead className="bg-muted/40">
                            <tr className="text-left">
                              <th className="p-1.5">Item</th>
                              <th className="p-1.5 text-right">Inv Qty</th>
                              <th className="p-1.5 text-right">Recv Qty</th>
                              <th className="p-1.5 text-right">Variance</th>
                              <th className="p-1.5 text-right">Unit Cost</th>
                              <th className="p-1.5 text-right">Inv Total</th>
                              <th className="p-1.5 text-right">Recv Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ line, recvQty, invQty, variance }) => (
                              <tr key={line.id} className="border-t border-border">
                                <td className="p-1.5">{line.description}</td>
                                <td className="p-1.5 text-right tabular-nums">{invQty}</td>
                                <td className="p-1.5 text-right tabular-nums">{recvQty ?? "—"}</td>
                                <td className="p-1.5 text-right">
                                  {variance == null ? "" : Math.abs(variance) < 0.001 ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                                  ) : variance < 0 ? (
                                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">{variance.toFixed(2)}</Badge>
                                  ) : (
                                    <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px]">+{variance.toFixed(2)}</Badge>
                                  )}
                                </td>
                                <td className="p-1.5 text-right tabular-nums">{fmt(line.unit_price)}</td>
                                <td className="p-1.5 text-right tabular-nums">{fmt(invQty * line.unit_price)}</td>
                                <td className="p-1.5 text-right tabular-nums">{recvQty != null ? fmt(recvQty * line.unit_price) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-muted/30 font-medium">
                            <tr><td colSpan={5} className="p-1.5 text-right">Invoiced total</td><td className="p-1.5 text-right tabular-nums">{fmt(totalInv)}</td><td /></tr>
                            <tr><td colSpan={5} className="p-1.5 text-right">Received total</td><td /><td className="p-1.5 text-right tabular-nums">{fmt(totalRecv)}</td></tr>
                            <tr><td colSpan={5} className="p-1.5 text-right">Difference</td><td colSpan={2} className="p-1.5 text-right tabular-nums">{fmt(totalRecv - totalInv)}</td></tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Invoice" description="This will permanently delete this invoice and all its line items." />
      <AttachmentViewerDialog open={viewerOpen} onOpenChange={setViewerOpen} fileUrl={viewerFileUrl} title={viewerTitle} />

      <DisputeConfirmDialog
        open={editDisputeOpen}
        onOpenChange={(o) => { setEditDisputeOpen(o); if (!o) setEditDisputePayload(null); }}
        lines={editDisputePayload?.lines || []}
        disputedAmount={editDisputePayload?.amount || 0}
        busy={saving}
        onConfirm={async () => {
          setEditDisputeOpen(false);
          await handleSaveEdit({ forceDispute: true });
        }}
      />

      <VoidInvoiceDialog
        open={voidOpen}
        onOpenChange={(o) => { setVoidOpen(o); if (!o) setVoidTarget(null); }}
        invoiceNumber={voidTarget?.invoice_number}
        busy={voiding}
        onConfirm={async (reason) => {
          if (!voidTarget) return;
          setVoiding(true);
          const { error } = await supabase
            .from("invoices")
            .update({
              status: "voided",
              void_reason: reason,
              voided_at: new Date().toISOString(),
              voided_by: user?.id || null,
            } as any)
            .eq("id", voidTarget.id);
          setVoiding(false);
          if (error) {
            toast.error(`Void failed: ${error.message}`);
            return;
          }
          toast.success(`Invoice ${voidTarget.invoice_number} voided.`);
          setVoidOpen(false);
          setVoidTarget(null);
          await fetchAll?.();
        }}
      />
    </div>
  );
}

// ----- Invoice table section with pagination & filters -----------
interface InvoiceKpis {
  total: number;
  underReview: number;
  approved: number;
  exceptions: number;
  disputed: number;
  duplicates: number;
  totalValue: number;
  pct: (n: number) => string;
}

interface InvoiceTableSectionProps {
  filtered: Invoice[];
  invoices: Invoice[];
  suppliers: { id: string; name: string }[];
  kpis: InvoiceKpis;
  totalAmount: number;
  columns: { key: string; label: string; align?: "right" }[];
  sortColumns: SortColumn[];
  toggleSort: (key: string, additive: boolean) => void;
  SortIcon: React.FC<{ col: string }>;
  search: string;
  setSearch: (v: string) => void;
  supplierFilter: string;
  setSupplierFilter: (v: string) => void;
  venueFilter: string;
  setVenueFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  reviewStatusFilter: string;
  setReviewStatusFilter: (v: string) => void;
  exceptionNoteFilter: string;
  setExceptionNoteFilter: (v: string) => void;
  monthFilter: string;
  setMonthFilter: (v: string) => void;
  months: string[];
  fmtMonth: (ym: string) => string;
  openDetail: (inv: Invoice) => void;
  openAttachmentViewer: (fileUrl: string, invoiceNumber: string) => void;
  setDeletingId: (id: string) => void;
  setDeleteOpen: (open: boolean) => void;
  onUpdateField: (id: string, patch: Partial<Invoice>) => void;
  onUploadClick: () => void;
  invoiceVarianceMap: Record<string, boolean>;
}

function InvoiceTableSection({
  filtered, invoices, suppliers, kpis, totalAmount, columns, sortColumns, toggleSort, SortIcon,
  search, setSearch, supplierFilter, setSupplierFilter, venueFilter, setVenueFilter, statusFilter, setStatusFilter,
  reviewStatusFilter, setReviewStatusFilter, exceptionNoteFilter, setExceptionNoteFilter,
  monthFilter, setMonthFilter, months, fmtMonth,
  openDetail, openAttachmentViewer, setDeletingId, setDeleteOpen, onUpdateField, onUploadClick,
  invoiceVarianceMap,
}: InvoiceTableSectionProps) {
  const pag = usePagination(filtered, 25);

  const filterFields: FilterField[] = [
    { type: "select", key: "supplier", label: "Supplier", value: supplierFilter, onChange: setSupplierFilter,
      options: suppliers.map(s => ({ value: s.id, label: s.name })),
      allLabel: "All Suppliers" },
    { type: "select", key: "venue", label: "Venue", value: venueFilter, onChange: setVenueFilter,
      options: [{ value: "Assembly", label: "Assembly" }, { value: "Caliente", label: "Caliente" }, { value: "Hanabi", label: "Hanabi" }],
      allLabel: "All Venues" },
    { type: "select", key: "status", label: "Status", value: statusFilter, onChange: setStatusFilter,
      options: STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
      allLabel: "All Statuses" },
    { type: "select", key: "review_status", label: "Review Status", value: reviewStatusFilter, onChange: setReviewStatusFilter,
      options: REVIEW_STATUSES.map(s => ({ value: s, label: s })),
      allLabel: "All Review Statuses" },
    { type: "select", key: "exception_note", label: "Exception Note", value: exceptionNoteFilter, onChange: setExceptionNoteFilter,
      options: EXCEPTION_NOTES.map(s => ({ value: s, label: s })),
      allLabel: "All Exceptions" },
    { type: "select", key: "month", label: "Month", value: monthFilter, onChange: setMonthFilter,
      options: months.map(m => ({ value: m, label: fmtMonth(m) })),
      allLabel: "All Months" },
  ];

  const resetFilters = () => { setSupplierFilter("all"); setVenueFilter("all"); setStatusFilter("all"); setReviewStatusFilter("all"); setExceptionNoteFilter("all"); setMonthFilter("all"); };

  const handleDownload = () => downloadCSV(
    filtered.map((inv) => ({
      invoice_date: fmtDate(inv.invoice_date),
      invoice_number: inv.invoice_number,
      supplier_name: inv.supplier_name,
      venue: inv.venue,
      due_date: fmtDate(inv.due_date || ""),
      total_amount: Number(inv.total_amount).toFixed(2),
      status: inv.status,
      review_status: inv.review_status || "Under Review",
      exception_note: inv.exception_note || "-",
    })),
    columns.map((column) => ({ key: column.key, label: column.label })),
    "invoices",
  );

  const kpiCards: Array<{ label: string; value: string; sub: string; subTone?: string; icon: React.ReactNode; tone: string }> = [
    { label: "Total Invoices", value: kpis.total.toLocaleString(), sub: "All time", icon: <FileText className="h-4 w-4" />, tone: "text-foreground" },
    { label: "Under Review", value: kpis.underReview.toLocaleString(), sub: kpis.pct(kpis.underReview), subTone: "text-amber-400", icon: <Clock className="h-4 w-4" />, tone: "text-amber-400" },
    { label: "Approved", value: kpis.approved.toLocaleString(), sub: kpis.pct(kpis.approved), subTone: "text-emerald-400", icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-emerald-400" },
    { label: "Exceptions", value: kpis.exceptions.toLocaleString(), sub: kpis.pct(kpis.exceptions), subTone: "text-red-400", icon: <AlertTriangle className="h-4 w-4" />, tone: "text-red-400" },
    { label: "Disputed", value: kpis.disputed.toLocaleString(), sub: kpis.pct(kpis.disputed), subTone: "text-orange-400", icon: <MessageSquareWarning className="h-4 w-4" />, tone: "text-orange-400" },
    { label: "Duplicates", value: kpis.duplicates.toLocaleString(), sub: kpis.pct(kpis.duplicates), subTone: "text-violet-400", icon: <CopyIcon className="h-4 w-4" />, tone: "text-violet-400" },
    { label: "Total Value", value: `$${fmt(kpis.totalValue)}`, sub: "All time", icon: <DollarSign className="h-4 w-4" />, tone: "text-foreground" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Invoices Database</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {kpiCards.map((k) => (
          <div key={k.label} className="card-glass rounded-lg p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`text-[11px] font-medium ${k.tone}`}>{k.label}</div>
              <div className="td-num text-xl font-bold mt-1 truncate">{k.value}</div>
              <div className={`text-[10px] mt-0.5 ${k.subTone || "text-muted-foreground"}`}>{k.sub}</div>
            </div>
            <div className={`rounded-full p-2 bg-muted/40 ${k.tone}`}>{k.icon}</div>
          </div>
        ))}
      </div>

    <DataTableShell
      search={{ value: search, onChange: setSearch, placeholder: "Search invoice # or supplier..." }}
      filters={{ fields: filterFields, onReset: resetFilters }}
      resultCount={<>Showing {filtered.length} of {invoices.length} invoices · Total: <span className="font-semibold">${fmt(totalAmount)}</span></>}
      toolbarRight={
        <>
          <Button size="sm" variant="outline" onClick={onUploadClick} className="h-9">
            <ScanLine className="h-4 w-4 mr-1" />Upload Invoice
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} className="h-9">
            <Download className="h-4 w-4 mr-1" />Download
          </Button>
        </>
      }
      pagination={{
        page: pag.page, pageSize: pag.pageSize, totalPages: pag.totalPages,
        rangeStart: pag.rangeStart, rangeEnd: pag.rangeEnd, total: pag.total,
        onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize,
        pageSizeOptions: [10, 25, 50, 100, "all"],
      }}
    >
      <Table>
        <TableHeader className="bg-primary">
          <TableRow className="hover:bg-primary">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                onClick={(e) => toggleSort(column.key, (e as any).shiftKey)}
                className={`cursor-pointer select-none text-primary-foreground font-semibold ${column.align === "right" ? "text-right" : ""}`}
                title="Click to sort. Shift+click for multi-column sort."
              >
                <span className={`inline-flex items-center gap-1 ${column.align === "right" ? "justify-end w-full" : ""}`}>
                  {column.label}<SortIcon col={column.key} />
                </span>
              </TableHead>
            ))}
            <TableHead className="bg-primary text-primary-foreground w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pag.pageItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="py-12 text-center text-muted-foreground">
                No invoices found. Upload your first invoice above.
              </TableCell>
            </TableRow>
          ) : (
            pag.pageItems.map((inv) => (
              <TableRow key={inv.id} onClick={() => openDetail(inv)} className={`cursor-pointer text-[12px] ${(inv.status || "").toLowerCase() === "voided" ? "opacity-50" : ""}`}>
                <TableCell className="whitespace-nowrap text-muted-foreground py-2">{fmtDate(inv.invoice_date)}</TableCell>
                <TableCell className="py-2 font-mono font-medium text-primary">
                  <span className="inline-flex items-center gap-1.5">
                    {(() => {
                      const anomaly = (inv as any).ai_anomaly;
                      const flags: any[] = anomaly?.flags ?? [];
                      if (flags.length === 0) return null;
                      const summary = flags.map((f) => `${f.type}${f.reason ? ` — ${f.reason}` : ""}`).join("\n");
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center text-amber-400" onClick={(e) => e.stopPropagation()}>
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
                              <div className="font-medium mb-0.5 flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> Bani flagged {flags.length} issue{flags.length === 1 ? "" : "s"}
                              </div>
                              {summary}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                    {inv.invoice_number}
                  </span>
                </TableCell>

                <TableCell className="py-2 font-medium text-foreground">{inv.supplier_name}</TableCell>
                <TableCell className="py-2">{inv.venue}</TableCell>
                <TableCell className="py-2 whitespace-nowrap text-muted-foreground">{fmtDate(inv.due_date || "")}</TableCell>
                <TableCell className="py-2 text-right font-semibold tabular-nums">{fmtForSupplier(Number(inv.total_amount), inv.supplier_name)}</TableCell>
                <TableCell className="py-2">
                  <span className="inline-flex items-center gap-1">
                    {inv.status ? (
                      <Badge className={`capitalize px-1.5 py-0 text-[10px] ${STATUS_BADGE[inv.status] || "bg-muted text-muted-foreground"}`}>
                        {inv.status}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                    {(inv as any).has_disputes && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-orange-500/15 text-orange-300 border border-orange-500/30 text-[10px] px-1.5 py-0 cursor-help">
                              Disputed
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Variance: ${Number((inv as any).disputed_amount || 0).toFixed(2)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {invoiceVarianceMap[inv.id] && (
                      <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0">GRN variance</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const rs = inv.review_status || "Under Review";
                    return (
                      <Select value={rs} onValueChange={(v) => onUpdateField(inv.id, { review_status: v as any })}>
                        <SelectTrigger className={`h-7 px-2 text-[10px] border-0 ${REVIEW_BADGE[rs] || "bg-muted text-muted-foreground"}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REVIEW_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const en = inv.exception_note || "-";
                    return (
                      <Select value={en} onValueChange={(v) => onUpdateField(inv.id, { exception_note: v as any })}>
                        <SelectTrigger className={`h-7 px-2 text-[10px] border-0 ${en === "-" ? "bg-transparent text-muted-foreground" : (EXCEPTION_BADGE[en] || "bg-muted text-muted-foreground")}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXCEPTION_NOTES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </TableCell>
                <TableCell className="py-2">
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
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </DataTableShell>
    </div>
  );
}

