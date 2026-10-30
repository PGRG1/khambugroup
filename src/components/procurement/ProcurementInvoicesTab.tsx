import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useVenueScope } from "@/hooks/useVenueScope";
import { toast } from "sonner";
import { autoCreateGrnFromInvoice } from "@/utils/autoCreateGrnFromInvoice";
import { syncGrnFromInvoice } from "@/utils/syncGrnFromInvoice";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { resolveProductMatch, resolveExactMatch } from "@/utils/productMasterResolver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { Toolbar, FilterPanel, FilterGroup, SortMenu } from "@/components/kit";
import { mtdRange } from "@/components/revenue-overview/utils";
import { monthSoFarLabel } from "@/utils/revenueOverview";
import { shortDay } from "@/utils/salesRecordChecks";
import { Label } from "@/components/ui/label";
import { Search, Trash2, ScanLine, Pencil, Eye, ArrowUpDown, ArrowUp, ArrowDown, X, Download, Plus, AlertTriangle, FileText, Clock, CheckCircle2, Copy as CopyIcon, DollarSign, Sparkles, MessageSquareWarning, Ban, ArrowRight } from "lucide-react";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import ProductAutocomplete from "@/components/invoices/ProductAutocomplete";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import { getRoundingMode, roundLineTotal, formatLineTotal, aggregateTotal, recalcAllDiscounts, normalizeDiscountMode, type RoundingMode, type DiscountMode } from "@/utils/invoiceRounding";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { usePagination } from "@/components/common/data-table";
import DateFilter from "@/components/dashboard/DateFilter";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency, formatDate, formatTableInteger, formatTableCurrency, formatDecimal } from "@/utils/format";
import { invoiceDownloadFiles } from "@/utils/invoiceListDownloads";
import { format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BaniScanSummary } from "@/components/invoices/ai/BaniScanSummary";
import { runBaniScan } from "@/lib/baniRunScan";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenues } from "@/hooks/useVenues";
import { LineStatusChip, getLineStatus } from "@/components/invoices/InvoiceReviewPanels";
import { fetchActiveDealsForSupplier, findDealForProduct, computeMissingDeals, type SupplierDeal } from "@/utils/supplierDeals";
import { uploadInvoiceSources, hasDurableAttachment, newlyCreatedPaths, parseAttachmentPaths } from "@/utils/invoiceAttachments";
import { supabaseStorageAdapter } from "@/utils/invoiceAttachmentClient";
import InvoiceAttachSourceDialog from "@/components/invoices/InvoiceAttachSourceDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { consumeScannerHandoff, peekScannerHandoff, subscribeScannerHandoff } from "@/utils/scannerHandoff";
import { useFloatingBaniStore } from "@/components/assistant/FloatingBaniContext";
import { DeliveryCheckDialog, type DeliveryCheckTarget } from "@/components/procurement/DeliveryCheckDialog";
import { REVIEW_STATUSES, mapScannerReviewStatus, computeHeldAmount } from "@/utils/invoiceStatus";


const REVIEW_BADGE: Record<string, string> = {
  "Draft": "bg-muted text-muted-foreground border border-border",
  "To approve": "bg-info/10 text-info border border-info/30",
  "Approved": "bg-primary/10 text-primary border border-primary/25",
  "Disputed": "bg-warning/10 text-warning border border-warning/30",
  "Voided": "bg-muted text-muted-foreground border border-border",
  // Legacy value, kept readable:
  "Under Review": "bg-muted text-muted-foreground border border-border",
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
  supplier_entry_id?: string;
  accepted_price: string;
  master_price?: number;
  price_disputed: boolean;
  is_free_unit_line: boolean;
  deal_id: string | null;
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
  accepted_price: "",
  price_disputed: false,
  is_free_unit_line: false,
  deal_id: null,
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


export interface InvoiceWorkflowControls {
  upload: () => void;
  openInvoice: (id: string) => void;
}

export default function ProcurementInvoicesTab({ renderRegister }: { renderRegister?: (controls: InvoiceWorkflowControls) => React.ReactNode } = {}) {
  const { invoices, suppliers, loading, fetchAll, fetchLineItems, createInvoice, createScannerInvoiceWithAttachments, updateInvoice, deleteInvoice } = useInvoiceData();
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const { venues: dbVenues } = useVenues();
  const activeVenueNames = React.useMemo(() => dbVenues.filter((v) => v.is_active).map((v) => v.name), [dbVenues]);


  const [productMaster, setProductMaster] = useState<ProductMasterEntry[]>([]);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const venueScope = useVenueScope();
  const venueFilter: string = "all"; const setVenueFilter = (_v: string) => {};
  
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");
  
  const [monthFilter, setMonthFilter] = useState<string>("MTD");
  const [periodFrom, setPeriodFrom] = useState<Date | undefined>(() => mtdRange().from);
  const [periodTo, setPeriodTo] = useState<Date | undefined>(() => mtdRange().to);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ key: "invoice_date", dir: "desc" }]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerDirty, setScannerDirty] = useState(false);
  const [scannerKey, setScannerKey] = useState(0);
  const [handoffConflict, setHandoffConflict] = useState(false);
  const [handoffTick, setHandoffTick] = useState(0);
  const [problemTarget, setProblemTarget] = useState<DeliveryCheckTarget | null>(null);
  // Floating-Bani scanner handoff: open the scanner for a pending request, but
  // never destroy an unsaved review — ask first.
  useEffect(() => subscribeScannerHandoff(() => setHandoffTick((t) => t + 1)), []);
  const pendingHandoff = peekScannerHandoff();
  const baniStore = useFloatingBaniStore();
  useEffect(() => {
    if (!pendingHandoff) return;
    const hasFiles = pendingHandoff.mode === "scan" && pendingHandoff.files.length > 0;
    if (scannerOpen && scannerDirty && hasFiles) {
      // The decision dialog must be clickable: the hosted Bani panel stacks
      // above it, so tuck the panel away (conversation state is preserved).
      baniStore?.open[1](false);
      setHandoffConflict(true);
    } else if (!scannerOpen) setScannerOpen(true);
    // A plain "open" while the scanner is already up just leaves it focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffTick]);
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
  const [attachTarget, setAttachTarget] = useState<any | null>(null);
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
  const [updatingMasterIdx, setUpdatingMasterIdx] = useState<number | null>(null);
  const [activeDeals, setActiveDeals] = useState<SupplierDeal[]>([]);
  const [supplierAccounts, setSupplierAccounts] = useState<Array<{ id: string; account_number: string; label: string | null; default_venue_id: string | null }>>([]);

  useEffect(() => {
    const sid = editForm.supplier_id || selectedInvoice?.supplier_id;
    if (!editing || !tenantId || !sid) { setSupplierAccounts([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("supplier_accounts")
        .select("id, account_number, label, default_venue_id")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", sid)
        .eq("is_active", true)
        .order("account_number");
      if (!cancelled) setSupplierAccounts((data || []) as any[]);
    })();
    return () => { cancelled = true; };
  }, [editing, tenantId, editForm.supplier_id, selectedInvoice?.supplier_id]);

  const batchFileRef = useRef<{ size: number; url: string; name: string } | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const loadProductMaster = React.useCallback(async () => {
    const [pm, ps] = await Promise.all([
      fetchAllRows("product_master", "id, internal_sku, internal_product_name, external_sku, supplier_product_name, supplier, purchase_unit_cost, purchase_unit, stock_uom, stock_qty", undefined, tenantId),
      fetchAllRows("product_suppliers", "id, product_master_id, supplier, external_sku, supplier_product_name, purchase_unit_cost, purchase_unit, stock_uom, stock_qty", undefined, tenantId),
    ]);
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
  }, [tenantId]);

  useEffect(() => { loadProductMaster(); }, [loadProductMaster]);

  // Load active supplier deals when editing and supplier changes
  useEffect(() => {
    const sid = editForm.supplier_id || selectedInvoice?.supplier_id;
    if (!sid || !tenantId || !editing) { setActiveDeals([]); return; }
    fetchActiveDealsForSupplier(sid, tenantId).then(setActiveDeals);
  }, [editing, editForm.supplier_id, selectedInvoice?.supplier_id, tenantId]);


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
      if (supplierFilter !== "all" && inv.supplier_id !== supplierFilter) return false;
      if (!venueScope.includesName(inv.venue)) return false;
      
      if (reviewStatusFilter !== "all" && (inv.review_status || "Approved") !== reviewStatusFilter) return false;
      
      if (monthFilter === "custom" || monthFilter === "MTD") {
        if (!inv.invoice_date) return false;
        if (periodFrom && inv.invoice_date < format(periodFrom, "yyyy-MM-dd")) return false;
        if (periodTo && inv.invoice_date > format(periodTo, "yyyy-MM-dd")) return false;
      } else if (monthFilter !== "all" && monthFilter !== "__latest__" && (!inv.invoice_date || !inv.invoice_date.startsWith(monthFilter))) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q) || (inv.supplier_name || "").toLowerCase().includes(q);
    });

    return sortRows(result, sortColumns);
  }, [invoices, supplierFilter, venueScope.includesName, reviewStatusFilter, monthFilter, periodFrom, periodTo, search, sortColumns]);

  // KPI computation across FILTERED invoices — reflects active filters
  const kpis = useMemo(() => {
    const total = filtered.length;
    let voided = 0, approved = 0, disputed = 0;
    let totalValue = 0;
    const dupKey = new Map<string, number>();
    for (const inv of filtered) {
      const rs = inv.review_status || "Approved";
      if (rs === "Voided") voided++;
      if (rs === "Approved") approved++;
      if (rs === "Disputed") disputed++;
      totalValue += Number(inv.total_amount) || 0;
      const k = `${inv.supplier_id}::${(inv.invoice_number || "").trim().toLowerCase()}`;
      if (k.trim() !== "::") dupKey.set(k, (dupKey.get(k) || 0) + 1);
    }
    let duplicates = 0;
    for (const v of dupKey.values()) if (v > 1) duplicates += v;
    const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%";
    return { total, voided, approved, disputed, duplicates, totalValue, pct };
  }, [filtered]);

  const columns = [
    { key: "invoice_date", label: "Date", w: "w-[100px]" },
    { key: "invoice_number", label: "Invoice #", w: "w-[120px]" },
    { key: "supplier_name", label: "Supplier & Vendor", w: "min-w-[160px]" },
    { key: "venue", label: "Venue", w: "w-[90px]" },
    { key: "due_date", label: "Due Date", w: "w-[100px]" },
    { key: "total_amount", label: "Amount", w: "w-[110px]", align: "right" as const },
    
    { key: "review_status", label: "Status", w: "w-[110px]" },
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
      supplier_entry_id: matchedProduct?.supplier_entry_id,
      master_price: typeof pmPrice === "number" && pmPrice > 0 ? pmPrice : undefined,
      accepted_price: (() => {
        const savedAcc = (line as any).accepted_price;
        if (savedAcc != null && savedAcc !== "") return String(savedAcc);
        if (typeof pmPrice === "number" && pmPrice > 0) return String(pmPrice);
        return priceStr;
      })(),
      price_disputed: (() => {
        const savedAcc = parseFloat(String((line as any).accepted_price ?? ""));
        const acc = Number.isFinite(savedAcc) && savedAcc > 0
          ? savedAcc
          : (typeof pmPrice === "number" && pmPrice > 0 ? pmPrice : currentPrice);
        if (currentPrice === 0) return false;
        return Math.round(acc * 100) !== Math.round(currentPrice * 100);
      })(),
      is_free_unit_line: !!(line as any).is_free_unit_line || (currentPrice === 0 && (parseFloat(qtyStr) || 0) > 0),
      deal_id: ((line as any).deal_id as string | null) ?? null,
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
    // Load GRN items linked to this invoice (confirmed or disputed GRNs)
    const loadGrn = async () => {
      const { data: grnRows } = await supabase
        .from("goods_received_notes" as any)
        .select("id, status")
        .eq("invoice_id", inv.id)
        .in("status", ["confirmed", "disputed"]);
      const grnIds = ((grnRows ?? []) as any[]).map((g) => g.id);
      if (grnIds.length === 0) return [] as any[];
      const { data: giData } = await supabase
        .from("grn_items" as any)
        .select("*")
        .in("grn_id", grnIds);
      return (giData ?? []) as any[];
    };
    let gi = await loadGrn();
    // Auto-heal: if GRN items exist but none link to current invoice lines,
    // re-link via RPC and reload.
    if (gi.length > 0 && items.length > 0) {
      const lineIds = new Set(items.map((l) => l.id));
      const anyLinked = gi.some((g: any) => g.invoice_line_item_id && lineIds.has(g.invoice_line_item_id));
      if (!anyLinked && tenantId) {
        const { error: rpcErr } = await supabase.rpc(
          "sync_grn_from_invoice" as any,
          { _invoice_id: inv.id, _tenant_id: tenantId } as any,
        );
        if (!rpcErr) gi = await loadGrn();
      }
    }
    setGrnItemsForInvoice(gi);
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
      supplier_account_id: (selectedInvoice as any).supplier_account_id ?? null,
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

  const handleSaveEdit = async () => {
    if (!selectedInvoice) return;

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
        accepted_price: (() => { const v = parseFloat(line.accepted_price || ""); return Number.isFinite(v) && v >= 0 ? v : null; })(),
        price_disputed: !!line.price_disputed,
        is_free_unit_line: !!line.is_free_unit_line,
        deal_id: line.deal_id ?? null,
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

    const success = await updateInvoice(
      selectedInvoice.id,
      {
        ...editForm,
        discount: discResults.headerDiscountAmount,
        discount_mode: headerMode,
        discount_rate: headerRate,
        subtotal: subtotalAmount,
        tax_amount: taxSum,
        total_amount: totalAmount,
        review_status: (editDisputeStats.hasDispute || editLines.some(l => l.price_disputed))
          ? "Disputed"
          : "Approved",
      } as any,
      mappedLines
    );

    if (success) {
      // Sync changes back to GRN — fire and forget. Authoritative rebuild
      // from the freshly saved invoice_line_items, so it works regardless of
      // delete+reinsert behaviour in updateInvoice.
      syncGrnFromInvoice(selectedInvoice.id, { tenantId: tenantId as string }).catch(() => {});

      setEditing(false);
      setSelectedInvoice(null);
      setLineItems([]);
    }

    setSaving(false);
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

      if (field === "unit_price") {
        const p = parseFloat(value) || 0;
        if (nextLine.pm_unit_price) {
          nextLine.price_changed = Math.abs(p - nextLine.pm_unit_price) > 0.01;
        }
        const acc = parseFloat(nextLine.accepted_price || "") || 0;
        nextLine.price_disputed = !nextLine.is_free_unit_line && p > 0 && acc > 0
          && Math.round(p * 100) !== Math.round(acc * 100);
        nextLine.is_free_unit_line = p === 0 && (parseFloat(nextLine.quantity) || 0) > 0;
        if (nextLine.is_free_unit_line && nextLine.product_master_id) {
          nextLine.deal_id = findDealForProduct(activeDeals, nextLine.product_master_id)?.id ?? null;
        } else if (!nextLine.is_free_unit_line) {
          nextLine.deal_id = null;
        }
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
        nextLine.master_price = undefined;
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

  const updateEditLineAcceptedPrice = (idx: number, value: string) => {
    setEditLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[idx] };
      if (line.is_free_unit_line) return prev;
      line.accepted_price = value;
      const acc = parseFloat(value) || 0;
      const inv = parseFloat(line.unit_price) || 0;
      line.price_disputed = inv > 0 && acc > 0 && Math.round(acc * 100) !== Math.round(inv * 100);
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
        master_price: typeof product.purchase_unit_cost === "number" && product.purchase_unit_cost > 0 ? product.purchase_unit_cost : undefined,
        accepted_price: typeof product.purchase_unit_cost === "number" && product.purchase_unit_cost > 0
          ? String(product.purchase_unit_cost)
          : (currentLine.accepted_price || currentLine.unit_price || ""),
        supplier_entry_id: product.supplier_entry_id,
        price_changed: typeof product.purchase_unit_cost === "number" && product.purchase_unit_cost > 0
          ? Math.abs((parseFloat(currentLine.unit_price) || 0) - product.purchase_unit_cost) > 0.01
          : false,
        price_disputed: typeof product.purchase_unit_cost === "number" && product.purchase_unit_cost > 0
          ? Math.abs((parseFloat(currentLine.unit_price) || 0) - product.purchase_unit_cost) > 0.01
          : false,
        is_free_unit_line: parseFloat(currentLine.unit_price) === 0 && (parseFloat(currentLine.quantity) || 0) > 0,
        deal_id: parseFloat(currentLine.unit_price) === 0
          ? (findDealForProduct(activeDeals, product.id)?.id ?? null)
          : null,
      };
      updated[idx] = nextLine;
      return updated;
    });
  };

  const addEditLine = () => setEditLines((prev) => [...prev, { ...emptyEditLine }]);
  const removeEditLine = (idx: number) => setEditLines((prev) => prev.filter((_, lineIdx) => lineIdx !== idx));

  const handleEditUpdateMaster = async (idx: number) => {
    const line = editLines[idx];
    if (!line) return;
    const newPrice = parseFloat(line.accepted_price || line.unit_price || "");
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      toast.error("Invalid price — enter a positive number first.");
      return;
    }
    if (!tenantId) return;
    setUpdatingMasterIdx(idx);
    try {
      let updated = false;
      if (line.supplier_entry_id) {
        const { error } = await supabase
          .from("product_suppliers" as any)
          .update({ purchase_unit_cost: newPrice } as any)
          .eq("id", line.supplier_entry_id)
          .eq("tenant_id", tenantId);
        if (error) { toast.error(`Failed to update Items Master: ${error.message}`); return; }
        updated = true;
      } else if (line.product_master_id) {
        const { error } = await supabase
          .from("product_master" as any)
          .update({ purchase_unit_cost: newPrice } as any)
          .eq("id", line.product_master_id)
          .eq("tenant_id", tenantId);
        if (error) { toast.error(`Failed to update Items Master: ${error.message}`); return; }
        updated = true;
      }
      if (!updated) { toast.error("This line is not linked to an Items Master entry."); return; }
      setEditLines((prev) => {
        const copy = [...prev];
        const l = { ...copy[idx] };
        l.pm_unit_price = newPrice;
        l.master_price = newPrice;
        l.price_changed = Math.abs((parseFloat(l.unit_price) || 0) - newPrice) > 0.01;
        copy[idx] = l;
        return copy;
      });
      try { await loadProductMaster(); } catch {}
      toast.success(`Items Master updated → $${newPrice}`);
    } finally {
      setUpdatingMasterIdx(null);
    }
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

  const missingDeals = useMemo(() => {
    if (!editing || activeDeals.length === 0) return [];
    return computeMissingDeals(
      activeDeals,
      editLines.map((l) => ({
        product_master_id: l.product_master_id || null,
        quantity: parseFloat(l.quantity) || 0,
        unit_price: parseFloat(l.unit_price) || 0,
        is_free_unit_line: !!l.is_free_unit_line,
        matched_internal_name: l.matched_internal_name,
        description: l.description,
      })),
    );
  }, [editing, editLines, activeDeals]);

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
              onClick={handleSaveEdit}
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
              <Label className="text-xs">Supplier account</Label>
              <Select
                value={((editForm as any).supplier_account_id as string | null) || "__none__"}
                disabled={!editForm.supplier_id || supplierAccounts.length === 0}
                onValueChange={(v) => {
                  if (v === "__none__") { setEditForm((f) => ({ ...(f as any), supplier_account_id: null })); return; }
                  const sa = supplierAccounts.find((x) => x.id === v);
                  setEditForm((f) => {
                    const next: any = { ...(f as any), supplier_account_id: v };
                    if (sa?.default_venue_id) {
                      const ven = dbVenues.find((x) => x.id === sa.default_venue_id);
                      if (ven && ven.is_active) next.venue = ven.name;
                    }
                    return next;
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={editForm.supplier_id ? (supplierAccounts.length === 0 ? "No accounts for this supplier" : "Select account") : "Pick supplier first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {supplierAccounts.map((sa) => (
                    <SelectItem key={sa.id} value={sa.id}>
                      {sa.account_number}{sa.label ? ` · ${sa.label}` : ""}
                    </SelectItem>
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
                  {activeVenueNames.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
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
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Quantity differences logged — set a reason for each disputed line so the discrepancy can be followed up. You can still save the invoice.</span>
            </div>
          )}

          {missingDeals.length > 0 && (
            <div className="space-y-1">
              {missingDeals.map((m, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Deal not fully applied: <strong>{m.productName}</strong> — expected {m.expectedFree} free unit{m.expectedFree === 1 ? "" : "s"} ({m.deal.buy_qty}+{m.deal.free_qty} deal with {getSupplierNameById(editForm.supplier_id || selectedInvoice?.supplier_id)}). Check with supplier.
                  </span>
                </div>
              ))}
            </div>
          )}

          <h4 className="text-sm font-semibold">Line Items ({editLines.length})</h4>
          <div className="overflow-x-auto -mx-2">
            <div className="flex justify-end pb-1">
              <button
                type="button"
                onClick={() => {
                  editLines.forEach((line, index) => {
                    if (!line.is_free_unit_line) {
                      updateEditLineAcceptedPrice(index, line.unit_price);
                    }
                  });
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
              >
                Accept all invoice prices
              </button>
            </div>
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
                  <th className="w-[110px] px-1 py-1.5 text-left font-medium text-muted-foreground">Acc. price</th>
                  <th className="w-[140px] px-1 py-1.5 text-left font-medium text-muted-foreground">Discount</th>
                  <th className="w-[100px] px-1 py-1.5 text-right font-medium text-muted-foreground">Invoiced Amount</th>
                  <th className="w-[100px] px-1 py-1.5 text-right font-medium text-muted-foreground">Accepted Amount</th>
                  <th className="w-[100px] px-1 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="w-[80px] px-1 py-1.5 text-left font-medium text-muted-foreground">Action</th>
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
                    const accPrice = parseFloat(l.accepted_price || "");
                    const invPrice = parseFloat(l.unit_price) || 0;
                    // If accepted price set & differs, use accepted_price * accepted_qty (proportional discount share via ratio of price * qty)
                    const grossAcc = (Number.isFinite(accPrice) && accPrice > 0 ? accPrice : invPrice) * a;
                    const grossInv = invPrice * q;
                    const accepted = grossInv > 0 ? invoiced * (grossAcc / grossInv) : (q > 0 ? invoiced * (a / q) : 0);
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
                            className={`h-8 text-xs min-w-[95px] ${line.price_changed ? "border-primary" : ""} ${line.is_free_unit_line ? "border-blue-500 text-blue-600" : ""}`}
                            readOnly={line.is_free_unit_line}
                          />
                          {line.is_free_unit_line && (
                            <span className="absolute -top-1 -right-1 inline-flex items-center rounded-md px-1 py-0 text-[9px] font-medium border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">Deal</span>
                          )}
                          {line.price_changed && line.pm_unit_price !== undefined && !line.is_free_unit_line && (
                            <span className="mt-0.5 block whitespace-nowrap text-[9px] text-primary">PM: ${line.pm_unit_price.toFixed(2)}</span>
                          )}
                        </div>
                      </td>
                      {/* Acc. price */}
                      <td className="px-1 py-1 align-top">
                        {line.is_free_unit_line ? (
                          (() => {
                            const deal = line.deal_id ? activeDeals.find((d) => d.id === line.deal_id) : null;
                            const supName = getSupplierNameById(editForm.supplier_id || selectedInvoice?.supplier_id || null);
                            return (
                              <div className="h-8 flex items-center px-2 text-[10px] rounded-md border border-input bg-muted/50 text-muted-foreground whitespace-nowrap">
                                {deal ? `${deal.buy_qty}+${deal.free_qty} · ${supName}` : "Zero — unlinked"}
                              </div>
                            );
                          })()
                        ) : (
                          (() => {
                            const invPrice = parseFloat(line.unit_price) || 0;
                            const accNum = parseFloat(line.accepted_price || "");
                            const matchesInvoice = Number.isFinite(accNum)
                              && Math.round(accNum * 100) === Math.round(invPrice * 100);
                            const differsFromMaster = line.master_price != null
                              && Number.isFinite(accNum)
                              && Math.round(accNum * 100) !== Math.round((line.master_price as number) * 100);
                            const deal = line.deal_id ? activeDeals.find((d) => d.id === line.deal_id) : null;
                            let effective: number | null = null;
                            if (deal && Number.isFinite(accNum)) {
                              effective = (deal.buy_qty * accNum) / (deal.buy_qty + deal.free_qty);
                            }
                            return (
                              <div className="flex flex-col gap-0.5 px-1 min-w-[110px]">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.accepted_price || ""}
                                    onChange={(e) => updateEditLineAcceptedPrice(index, e.target.value)}
                                    className={`text-xs h-7 w-full ${differsFromMaster ? "border-amber-500 bg-amber-500/5" : ""}`}
                                    placeholder="—"
                                  />
                                  {!matchesInvoice && (
                                    <button
                                      type="button"
                                      onClick={() => updateEditLineAcceptedPrice(index, line.unit_price)}
                                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                                      title={`Copy invoice price $${invPrice.toFixed(2)}`}
                                    >
                                      <ArrowRight className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  {matchesInvoice && (
                                    <span className="text-[10px] text-muted-foreground">= invoice price</span>
                                  )}
                                  {line.master_price != null && (
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      Master: ${(line.master_price as number).toFixed(2)}
                                    </span>
                                  )}
                                  {line.master_price == null && !matchesInvoice && (
                                    <span className="text-[10px] text-muted-foreground">No master price</span>
                                  )}
                                  {differsFromMaster && line.product_master_id && (
                                    <button
                                      type="button"
                                      disabled={updatingMasterIdx === index}
                                      onClick={() => handleEditUpdateMaster(index)}
                                      className="text-[10px] underline text-amber-600 dark:text-amber-400 hover:text-amber-700 disabled:opacity-50 whitespace-nowrap"
                                    >
                                      {updatingMasterIdx === index ? "Updating…" : "Update master"}
                                    </button>
                                  )}
                                </div>
                                {effective !== null && (
                                  <span className="text-[9px] text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                    Eff: ${effective.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        )}
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
                      {/* Status chip */}
                      <td className="px-1 py-1 align-top">
                        {(() => {
                          const s = getLineStatus({
                            description: line.description,
                            item_code: line.item_code,
                            unit: line.unit,
                            quantity: line.quantity,
                            unit_price: line.unit_price,
                            matched_sku: line.matched_sku,
                            matched_internal_name: line.matched_internal_name,
                            unmatched: line.unmatched && !!line.description.trim(),
                            price_changed: line.price_changed,
                            price_disputed: line.price_disputed,
                            is_free_unit_line: line.is_free_unit_line,
                            accepted_qty: line.accepted_qty,
                          });
                          return <LineStatusChip variant={s.variant} label={s.label} />;
                        })()}
                      </td>
                      {/* Action: show match info tooltip */}
                      <td className="px-1 py-1 align-top">
                        {line.matched_sku ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-[10px] underline text-muted-foreground hover:text-foreground">
                                  Details
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[260px] text-xs">
                                <p><strong>SKU:</strong> {line.matched_sku}</p>
                                <p><strong>Name:</strong> {line.matched_internal_name}</p>
                                {line.pm_unit_price !== undefined && (
                                  <p><strong>Master price:</strong> ${line.pm_unit_price.toFixed(2)}</p>
                                )}
                                {line.price_disputed && (
                                  <p className="text-amber-500">Price dispute: accepted ≠ invoiced</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : line.unmatched && line.description.trim() ? (
                          <Badge className="bg-destructive/15 text-destructive-foreground text-[9px]">Unmatched</Badge>
                        ) : null}
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
                const invPrice = parseFloat(l.unit_price) || 0;
                const accPrice = parseFloat(l.accepted_price || "");
                const grossInv = invPrice * q;
                const grossAcc = (Number.isFinite(accPrice) && accPrice > 0 ? accPrice : invPrice) * a;
                invSub += invoiced;
                accSub += grossInv > 0 ? invoiced * (grossAcc / grossInv) : (q > 0 ? invoiced * (a / q) : 0);
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
          key={scannerKey}
          suppliers={suppliers}
          handoff={pendingHandoff ? { ...pendingHandoff, venue: pendingHandoff.venue && activeVenueNames.includes(pendingHandoff.venue) ? pendingHandoff.venue : null } : null}
          onDirtyChange={setScannerDirty}
          productMaster={productMaster}
          onProductMasterChanged={loadProductMaster}
          onSuppliersChanged={fetchAll}
          onSave={async (inv, lines, files) => {
            // Durable-before-data: the source document must exist in storage and be
            // verified BEFORE any invoice row is created. Any failure throws so the
            // scanner keeps the draft open and no orphan invoice is written.
            if (!files || files.length === 0) {
              toast.error("Source document missing — re-attach the scanned file before saving.");
              throw new Error("MISSING_SOURCE_ATTACHMENT");
            }
            if (!tenantId) {
              toast.error("No active client selected — invoice not saved.");
              throw new Error("MISSING_TENANT");
            }

            const storage = supabaseStorageAdapter();
            let stored;
            try {
              stored = await uploadInvoiceSources(
                storage,
                tenantId,
                inv.invoice_date,
                inv.invoice_number,
                files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f })),
              );
            } catch (e: any) {
              console.error("[invoice-attachment] upload/verify failed", { invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, error: e?.message });
              toast.error(`Attachment upload failed — invoice not saved. ${e?.message || ""}`);
              throw e;
            }

            const cleanupAttempt = async () => {
              const createdPaths = newlyCreatedPaths(stored);
              if (createdPaths.length > 0) await storage.remove(createdPaths).catch(() => undefined);
            };

            // Single DB transaction: invoice + line items + attachment metadata +
            // audit event. Nothing financial is written unless linkage commits.
            let createdId: string;
            try {
              createdId = await createScannerInvoiceWithAttachments(
                {
                  ...inv,
                  discount: inv.discount ?? 0,
                  discount_type: (inv as any).discount_type === "refund" ? "refund" : "discount",
                  status: inv.status === "paid" ? "paid" : "unpaid",
                  review_status: mapScannerReviewStatus((inv as any).status),
                  held_amount: (inv as any).status === "disputed" ? computeHeldAmount(lines as any) : 0,
                  subtotal: lines.reduce((sum, line) => sum + line.total - line.tax_amount, 0),
                  tax_amount: lines.reduce((sum, line) => sum + line.tax_amount, 0),
                  total_amount: lines.reduce((sum, line) => sum + line.total, 0),
                  entered_by: user?.id || "",
                } as any,
                lines,
                stored.map((s) => ({
                  bucket: s.bucket,
                  path: s.path,
                  original_name: s.original_name,
                  mime_type: s.mime_type,
                  size_bytes: s.size_bytes,
                  checksum: s.checksum,
                  sort_order: s.sort_order,
                })),
              );
            } catch (e: any) {
              console.error("[invoice-attachment] atomic scanner save failed", { invoice_number: inv.invoice_number, error: e?.message });
              await cleanupAttempt();
              toast.error(`Invoice not saved — ${e?.message || "attachment linkage failed"}.`);
              throw e;
            }
            const created = { id: createdId } as { id: string };

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

      <DeliveryCheckDialog
        target={problemTarget}
        tenantId={tenantId || ""}
        userId={user?.id || ""}
        onClose={() => { setProblemTarget(null); fetchAll(); }}
      />

      <AlertDialog open={handoffConflict} onOpenChange={setHandoffConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the unsaved review?</AlertDialogTitle>
            <AlertDialogDescription>
              Bani handed new invoice files to Scan Invoice, but this review has unsaved work. Replacing it discards the current draft; keeping it ignores the new files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { if (pendingHandoff) consumeScannerHandoff(pendingHandoff.id); }}>
              Keep current review
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setScannerKey((k) => k + 1)}>
              Replace with new files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renderRegister ? renderRegister({ upload: () => setScannerOpen(true), openInvoice: id => { const invoice = invoices.find(inv => inv.id === id); if (invoice) void openDetail(invoice); } }) : <InvoiceTableSection
        filtered={filtered}
        invoices={invoices}
        suppliers={suppliers}
        kpis={kpis}
        loading={loading}
        periodFrom={periodFrom}
        periodTo={periodTo}
        setPeriodFrom={setPeriodFrom}
        setPeriodTo={setPeriodTo}
        totalAmount={totalAmount}
        columns={columns}
        sortColumns={sortColumns}
        toggleSort={toggleSort}
        SortIcon={SortIcon}
        setSortColumns={setSortColumns}
        search={search}
        setSearch={setSearch}
        supplierFilter={supplierFilter}
        setSupplierFilter={setSupplierFilter}
        venueFilter={venueFilter}
        setVenueFilter={setVenueFilter}
        reviewStatusFilter={reviewStatusFilter}
        setReviewStatusFilter={setReviewStatusFilter}
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
        onAttachSource={(inv) => setAttachTarget(inv)}
      />}

      <InvoiceAttachSourceDialog
        open={!!attachTarget}
        onOpenChange={(o) => { if (!o) setAttachTarget(null); }}
        invoice={attachTarget}
        tenantId={tenantId}
        onAttached={() => { setAttachTarget(null); fetchAll(); }}
      />

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="kit sales-day-dialog max-w-[760px] grid-cols-[minmax(0,1fr)] p-0 gap-0 w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] rounded-lg overflow-y-auto">
          {selectedInvoice && (() => {
            const inv = selectedInvoice;
            const rs = inv.review_status || "Approved";
            const giByLine = new Map<string, any>();
            for (const gi of grnItemsForInvoice) if (gi.invoice_line_item_id) giByLine.set(gi.invoice_line_item_id, gi);
            const rows = lineItems.map(line => {
              const gi = giByLine.get(line.id);
              const recvQty = gi ? Number(gi.quantity_received) : null;
              const invQty = Number(line.quantity);
              return { line, recvQty, invQty, variance: recvQty != null ? recvQty - invQty : null };
            });
            const changed = rows.filter(row => row.variance != null && Math.abs(row.variance) > 0.001);
            const short = changed.filter(row => (row.variance ?? 0) < 0);
            const held = Number((inv as any).held_amount) || 0;
            const deliverySummary = changed.length ? changed.map(row => `${row.line.description}: ${formatDecimal(row.invQty)} ${row.line.unit || ""} invoiced, ${formatDecimal(row.recvQty ?? 0)} received`).join(" · ") + (held ? ` · ${formatCurrency(held)} held` : "") : grnItemsForInvoice.length ? "received as invoiced" : "delivery not recorded";
            const statusTone = (REVIEW_BADGE[rs] || REVIEW_BADGE["Under Review"]).split(" ").filter(token => token.startsWith("text-")).join(" ");
            return <div className="min-w-0 p-5 sm:p-7 space-y-5 text-foreground">
              <div className="space-y-1.5 pr-8"><DialogTitle className="text-[16px] font-semibold break-words">{inv.supplier_name || "Supplier"}</DialogTitle><DialogDescription className="text-[13px]">{inv.invoice_number} · <span className={statusTone}>{rs}</span></DialogDescription></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">{[["Date",formatDate(inv.invoice_date)],["Venue",inv.venue],["Due",inv.due_date ? formatDate(inv.due_date) : "Not set"],["Total",formatTableCurrency(Number(inv.total_amount))]].map(([label,value]) => <div key={label} className="min-w-0"><p className="kit-group-h mb-1">{label}</p><p className={label === "Total" ? "td-num font-semibold" : "break-words"}>{value}</p></div>)}</div>
              <BaniScanSummary invoiceId={inv.id} compact deliverySummary={short.length ? `${short.length} line${short.length === 1 ? "" : "s"} short: ${deliverySummary}` : deliverySummary} deliveryProblem={changed.length > 0}
                moreActions={<>
                  {!hasDurableAttachment(inv.file_url) && <DropdownMenuItem onClick={() => setAttachTarget(inv)}>Attach source</DropdownMenuItem>}
                  <DropdownMenuItem className="text-destructive" onClick={() => { setDrawerOpen(false); setDeletingId(inv.id); setDeleteOpen(true); }}>Delete invoice</DropdownMenuItem>
                </>}
                footerActions={<>
                  {rs !== "Voided" && <Button variant="outline" className="kit-btn kit-btn-secondary" onClick={() => setProblemTarget({ invoiceId: inv.id, supplierName: inv.supplier_name || "Supplier", total: Number(inv.total_amount) || 0, invoiceDate: inv.invoice_date, lines: lineItems.map(line => { const gi = giByLine.get(line.id); return { invoice_line_item_id: line.id, description: line.description || "(no description)", unit: line.unit || "each", quantity_invoiced: Number(line.quantity) || 0, quantity_received: gi ? Number(gi.quantity_received) : Number(line.quantity) || 0, unit_price: Number(line.unit_price) || 0 }; }) })}>Report a problem</Button>}
                  <Button className="kit-btn kit-btn-primary" onClick={startEditing}><Pencil className="h-4 w-4" />Edit</Button>
                </>}>
                <div className="hidden min-[641px]:block overflow-x-auto"><table className="w-full table-fixed text-[13px]" aria-label="Invoice items"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="text-left py-3 w-[42%]">Item</th><th className="text-right px-1">{changed.length ? "Invoiced" : "Qty"}</th>{changed.length > 0 && <th className="text-right px-1">Received</th>}<th className="text-right px-1">Price</th><th className="text-right pl-1">Total</th></tr></thead><tbody>{rows.map(({line,invQty,recvQty}) => <tr key={line.id} className="border-b border-border/50"><td className="py-3 pr-2 break-words">{line.description}</td><td className="td-num text-right px-1">{formatDecimal(invQty)}</td>{changed.length > 0 && <td className="td-num text-right px-1">{recvQty == null ? "—" : formatDecimal(recvQty)}</td>}<td className="td-num text-right px-1">{formatDecimal(line.unit_price)}</td><td className="td-num text-right pl-1">{formatDecimal(invQty * line.unit_price)}</td></tr>)}</tbody></table></div>
                <ul className="min-[641px]:hidden divide-y divide-border text-[13px]" aria-label="Invoice items">{rows.map(({line,invQty,recvQty,variance}) => <li key={line.id} className="py-3 flex justify-between gap-3"><div className="min-w-0"><p className="break-words">{line.description}</p><p className="td-num text-xs text-muted-foreground mt-1">{formatDecimal(invQty)} {line.unit} × {formatTableCurrency(line.unit_price)}</p>{variance != null && Math.abs(variance) > 0.001 && <p className="text-xs text-warning mt-1">Invoiced {formatDecimal(invQty)} · Received {formatDecimal(recvQty ?? 0)}</p>}</div><span className="td-num shrink-0">{formatTableCurrency(invQty * line.unit_price)}</span></li>)}</ul>
                {inv.notes && <p className="text-[13px] whitespace-pre-wrap"><span className="kit-group-h">Notes</span><br />{inv.notes}</p>}
                <InvoiceAttachmentPreview invoice={inv} onView={() => { if (inv.file_url) openAttachmentViewer(inv.file_url, inv.invoice_number); }} onAttach={() => setAttachTarget(inv)} />
              </BaniScanSummary>
            </div>;
          })()}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Invoice" description="This will permanently delete this invoice and all its line items." />
      <AttachmentViewerDialog open={viewerOpen} onOpenChange={setViewerOpen} fileUrl={viewerFileUrl} title={viewerTitle} />
    </div>
  );
}

// ----- Invoice table section with pagination & filters -----------
interface InvoiceKpis {
  total: number;
  voided: number;
  approved: number;
  
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
  loading: boolean;
  periodFrom: Date | undefined;
  periodTo: Date | undefined;
  setPeriodFrom: (value: Date | undefined) => void;
  setPeriodTo: (value: Date | undefined) => void;
  totalAmount: number;
  columns: { key: string; label: string; align?: "right" }[];
  sortColumns: SortColumn[];
  toggleSort: (key: string, additive: boolean) => void;
  SortIcon: React.FC<{ col: string }>;
  setSortColumns: (value: SortColumn[]) => void;
  search: string;
  setSearch: (v: string) => void;
  supplierFilter: string;
  setSupplierFilter: (v: string) => void;
  venueFilter: string;
  setVenueFilter: (v: string) => void;
  reviewStatusFilter: string;
  setReviewStatusFilter: (v: string) => void;
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
  onAttachSource: (inv: any) => void;
}

function InvoiceTableSection({
  filtered, suppliers, kpis, columns, sortColumns, setSortColumns,
  search, setSearch, supplierFilter, setSupplierFilter,
  reviewStatusFilter, setReviewStatusFilter, monthFilter, setMonthFilter, months, fmtMonth,
  openDetail, openAttachmentViewer, setDeletingId, setDeleteOpen, onUploadClick,
  invoiceVarianceMap, onAttachSource, loading, periodFrom, periodTo, setPeriodFrom, setPeriodTo,
}: InvoiceTableSectionProps) {
  const pag = usePagination(filtered, 25);
  const isMobile = useIsMobile();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const scope = useVenueScope();
  useEffect(() => { setSelectedIds(new Set()); pag.setPage(1); }, [search, supplierFilter, reviewStatusFilter, monthFilter, periodFrom, periodTo]);
  const selected = filtered.filter(inv => selectedIds.has(inv.id));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleOne = (id: string) => setSelectedIds(old => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const handleDownload = () => downloadCSV(
    filtered.map(inv => ({
      invoice_date: fmtDate(inv.invoice_date), invoice_number: inv.invoice_number,
      supplier_name: inv.supplier_name, venue: inv.venue, due_date: fmtDate(inv.due_date || ""),
      total_amount: Number(inv.total_amount).toFixed(2), review_status: inv.review_status || "Approved",
    })),
    columns.map(column => ({ key: column.key, label: column.label })), "invoices",
  );
  const files = invoiceDownloadFiles(filtered, selectedIds);
  const downloadFiles = async () => {
    setDownloading(true);
    let success = 0;
    try {
      for (const file of files) {
        const { data, error } = await supabase.storage.from("invoice-files").createSignedUrl(file.path, 300, { download: file.name });
        if (error || !data?.signedUrl) continue;
        const a = document.createElement("a");
        a.href = data.signedUrl; a.download = file.name; a.target = "_blank"; a.rel = "noopener noreferrer";
        document.body.appendChild(a); a.click(); a.remove(); success++;
        if (files.length > 1) await new Promise(resolve => setTimeout(resolve, 350));
      }
      if (success < files.length) toast.warning(`Downloaded ${success} of ${files.length} files. Some attachments could not be downloaded.`);
      else toast.success(`Downloaded ${success} file${success === 1 ? "" : "s"}`);
    } catch { toast.error("Could not download invoice files. Please try again."); }
    finally { setDownloading(false); }
  };
  const statusText = (inv: Invoice) => {
    const status = inv.review_status || "Approved";
    // Reuse the existing review-status palette, without badge framing.
    const tone = (REVIEW_BADGE[status] || REVIEW_BADGE["Under Review"]).split(" ").filter(token => token.startsWith("text-")).join(" ");
    return <span className={`text-xs font-medium ${tone}`}>{status}</span>;
  };
  const flags = (inv: Invoice) => {
    const issues = (inv as any).ai_anomaly?.flags || [];
    const hasVariance = invoiceVarianceMap[inv.id];
    if (!issues.length && !hasVariance) return null;
    const text = [...issues.map((issue: any) => `${issue.type}${issue.reason ? ` — ${issue.reason}` : ""}`), ...(hasVariance ? ["GRN variance"] : [])].join("; ");
    return <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="text-warning" tabIndex={0} aria-label={text}><AlertTriangle className="h-3.5 w-3.5" /></span></TooltipTrigger><TooltipContent className="max-w-xs text-xs">{text}</TooltipContent></Tooltip></TooltipProvider>;
  };
  const upload = <Button onClick={onUploadClick} className="h-9 px-3 min-[641px]:h-10"><ScanLine className="h-4 w-4 mr-1.5" /><span className="min-[641px]:hidden">Upload</span><span className="max-[640px]:hidden">Upload invoice</span></Button>;
  const download = <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="kit-btn kit-tool-btn kit-btn-icon" aria-label="Download invoices" title="Download invoices" disabled={downloading}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!filtered.length} onClick={handleDownload}>Download list</DropdownMenuItem><DropdownMenuItem disabled={!files.length} onClick={downloadFiles}>Download invoice files</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  const periodName = monthFilter === "MTD" ? monthSoFarLabel() : monthFilter === "all" ? "All time" : monthFilter === "custom" ? "Selected dates" : fmtMonth(monthFilter);
  const checkCount = filtered.filter(inv => inv.review_status === "Disputed" || (inv as any).ai_anomaly?.flags?.length || invoiceVarianceMap[inv.id]).length;
  const sortKey = `${sortColumns[0]?.key || "invoice_date"}:${sortColumns[0]?.dir || "desc"}`;
  const sortOptions = [{key:"invoice_date:desc",label:"Newest first",compactLabel:"Newest"},{key:"invoice_date:asc",label:"Oldest first",compactLabel:"Oldest"},{key:"supplier_name:asc",label:"Supplier A–Z"},{key:"total_amount:desc",label:"Amount: highest first"},{key:"total_amount:asc",label:"Amount: lowest first"},{key:"review_status:asc",label:"Status"}];
  return <div className="space-y-6 min-w-0 max-[640px]:pb-24">
    <RevenuePageTop title="Invoices" actionsBesideTitle period={<DateFilter from={periodFrom} to={periodTo}
      onFromChange={date => { setMonthFilter("custom"); setPeriodFrom(date); }} onToChange={date => { setMonthFilter("custom"); setPeriodTo(date); }}
      months={months.map(fmtMonth)} labelled includeMtd initialPeriod="MTD"
      onPeriodSelect={selection => { if (selection === "MTD") { const range = mtdRange(); setMonthFilter("MTD"); setPeriodFrom(range.from); setPeriodTo(range.to); return; } const next = selection === "All Time" ? "all" : months.find(month => fmtMonth(month) === selection); if (next) { setMonthFilter(next); setPeriodFrom(undefined); setPeriodTo(undefined); } }} />} actions={upload} />
    <div data-invoice-tabs-host />
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Invoice records">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5" aria-label="Invoice summary"><span>{periodName}</span><span className="text-[13px] text-muted-foreground font-normal">· {formatTableInteger(kpis.total)} {kpis.total === 1 ? "invoice" : "invoices"} · {formatTableCurrency(kpis.totalValue)} · {formatTableInteger(checkCount)} to check</span></h2>
      <Toolbar mobileSearchBelow searchAfterControls search={search} onSearch={setSearch} placeholder="Search invoice # or supplier"
        filter={<FilterPanel activeCount={Number(supplierFilter !== "all") + Number(reviewStatusFilter !== "all")} onReset={() => { setSupplierFilter("all"); setReviewStatusFilter("all"); }} width={340}>
          <FilterGroup title="Supplier"><Select value={supplierFilter} onValueChange={setSupplierFilter}><SelectTrigger aria-label="Supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.filter(s => s.id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></FilterGroup>
          <FilterGroup title="Status"><Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Array.from(new Set([...REVIEW_STATUSES,"Under Review"])).map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></FilterGroup>
          <FilterGroup title="Venue"><p className="text-[13px] text-muted-foreground">{scope.label}</p><div className="flex flex-wrap gap-1.5">{scope.venues.map(venue => <Button key={venue.id} variant="outline" size="sm" aria-pressed={scope.includesId(venue.id)} onClick={() => scope.toggleVenue(venue.id)}>{venue.name}</Button>)}</div></FilterGroup>
          <FilterGroup title="Bulk actions"><Button variant="outline" className="kit-btn kit-tool-btn" aria-pressed={selectMode} onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedIds(new Set()); }}>{selectMode ? "Finish selecting" : "Select invoices"}</Button></FilterGroup>
        </FilterPanel>}
        sort={<SortMenu options={sortOptions} value={sortKey} onChange={value => { const [key,dir] = value.split(":"); setSortColumns([{key,dir:dir === "asc" ? "asc" : "desc"}]); }} />}
        downloadControl={download} />
      {selectMode && <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Checkbox className="!min-h-0 !h-4 w-4 shrink-0 rounded-sm" aria-label="Select all filtered invoices" checked={allSelected} onCheckedChange={() => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(inv => inv.id)))} /><span>{selected.length ? `${formatTableInteger(selected.length)} selected` : "Select invoices"}</span><Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>Done</Button></div>}
      {loading ? <p className="p-10 text-center text-sm text-muted-foreground">Loading invoices…</p> : !filtered.length ? <p className="p-10 text-center text-sm text-muted-foreground">No invoices match this period and filters.</p> : isMobile ? <ul className="divide-y divide-border/60">
        {pag.pageItems.map(inv => <li key={inv.id} className="flex items-center gap-2 px-3 min-h-11 py-2">{selectMode && <Checkbox className="!min-h-0 !h-4 w-4 shrink-0 rounded-sm" aria-label={`Select invoice ${inv.invoice_number}`} checked={selectedIds.has(inv.id)} onCheckedChange={() => toggleOne(inv.id)} />}<Button variant="ghost" onClick={() => openDetail(inv)} className="block flex-1 min-w-0 h-auto p-0 text-left font-normal hover:bg-transparent"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px]">{inv.supplier_name || "—"}</span><span className="td-num shrink-0 text-[13px]">{formatTableCurrency(Number(inv.total_amount))}</span></span><span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><span>{shortDay(inv.invoice_date)} ·</span><span className="break-all">{inv.invoice_number} ·</span>{statusText(inv)}{flags(inv)}</span></Button></li>)}
      </ul> : <div className="kit sales-table-scroll"><table className="sales-table !w-full" aria-label="Invoices"><colgroup>{selectMode && <col className="w-10" />}<col className="w-[16%]" /><col className="w-[28%]" /><col className="w-[22%]" /><col className="w-[20%]" /><col className="w-[14%]" /></colgroup><thead><tr>{selectMode && <th /> }<th className="sales-cell-left">Date</th><th className="sales-cell-left">Supplier</th><th className="sales-cell-left">Invoice #</th><th className="sales-cell-right">Amount (HK$)</th><th className="sales-cell-left">Status</th></tr></thead><tbody>{pag.pageItems.map(inv => <tr key={inv.id} tabIndex={0} className="sales-record-row" onClick={() => openDetail(inv)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(inv); } }}>{selectMode && <td onClick={e => e.stopPropagation()}><Checkbox className="!min-h-0 !h-4 w-4 shrink-0 rounded-sm" aria-label={`Select invoice ${inv.invoice_number}`} checked={selectedIds.has(inv.id)} onCheckedChange={() => toggleOne(inv.id)} /></td>}<td className="sales-cell-left">{shortDay(inv.invoice_date)}</td><td className="sales-cell-left" title={inv.supplier_name}>{inv.supplier_name || "—"}</td><td className="sales-cell-left td-num"><span className="inline-flex items-center gap-1">{inv.invoice_number}{flags(inv)}</span></td><td className="td-num">{formatTableCurrency(Number(inv.total_amount))}</td><td className="sales-cell-left">{statusText(inv)}</td></tr>)}</tbody></table></div>}
      {pag.totalPages > 1 && <div className="flex items-center justify-between gap-2 kit-divider pt-2 text-xs text-muted-foreground"><span className="td-num">{formatTableInteger(pag.rangeStart)}–{formatTableInteger(pag.rangeEnd)} of {formatTableInteger(pag.total)}</span><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous page" disabled={pag.page <= 1} onClick={() => pag.setPage(pag.page - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next page" disabled={pag.page >= pag.totalPages} onClick={() => pag.setPage(pag.page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>}
    </section>
  </div>;
}

function InvoiceAttachmentPreview({invoice,onView,onAttach}:{invoice:Invoice;onView:()=>void;onAttach:()=>void}) {
  const [thumbnail,setThumbnail] = useState<string | null>(null);
  const paths = parseAttachmentPaths(invoice.file_url);
  const path = paths[0];
  useEffect(() => { let active = true; setThumbnail(null); if (path && /\.(jpe?g|png|webp)$/i.test(path)) supabase.storage.from("invoice-files").createSignedUrl(path,300).then(({data}) => { if (active) setThumbnail(data?.signedUrl || null); }); return () => {active=false;}; },[path]);
  if (!paths.length) return <Button variant="outline" className="kit-btn kit-btn-secondary" onClick={onAttach}>Attachment missing · Attach source</Button>;
  return <div className="flex items-center gap-3 text-[13px]"><Button variant="ghost" className="h-14 w-12 shrink-0 overflow-hidden border border-border p-0" onClick={onView} aria-label="View invoice attachment">{thumbnail ? <img src={thumbnail} alt="Invoice thumbnail" className="h-full w-full object-cover" /> : <FileText className="h-6 w-6 text-muted-foreground" />}</Button><span>{path && /\.pdf$/i.test(path) ? "Invoice PDF" : "Invoice photo"} · {formatTableInteger(paths.length)} {paths.length === 1 ? "page" : "pages"} · <Button variant="link" className="kit-link p-0 h-auto" onClick={onView}>View</Button></span></div>;
}
