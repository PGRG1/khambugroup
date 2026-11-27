import {baseSymbol} from '@/utils/money';
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useProductMaster, ProductMasterItem, ProductSupplierEntry, FINANCIAL_TREATMENTS, plSectionFor } from "@/hooks/useProductMaster";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Download, AlertTriangle, CheckCircle2, Filter, Columns3, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, MoreVertical, Upload } from "lucide-react";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CategoryCascadeSelect from "@/components/procurement/CategoryCascadeSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { tonePill } from "@/components/kpi/toneStyles";
import { cn } from "@/lib/utils";

import UomSelect from "@/components/procurement/UomSelect";
import SupplierDealDialog, { SupplierDealEditable } from "@/components/procurement/SupplierDealDialog";
import { dealLabel, dealLive } from "@/utils/supplierRebates";
import { hongKongDate } from "@/utils/purchasingOverview";
import { formatCurrency } from "@/utils/salesUtils";
import { computeSetupHealth, type SetupHealthState } from "@/utils/productSetupHealth";
import { useCanEditItemList, ITEM_LIST_APPROVER_ONLY } from "@/hooks/useCanEditItemList";
import { ItemsUploadDialog } from "@/components/procurement/ItemsUploadDialog";
import { productNeeds, needsText, boughtAs } from "@/utils/productNeeds";
import { costAfterDeal, cheapestIndex } from "@/utils/productCosts";
import { useColumnLayout, ResizeHandle, ColumnsButton, fitCell, type ColumnDef } from "@/components/kit/ColumnLayout";
import { useAuth } from "@/hooks/useAuth";


interface SupplierDealRow {
  id: string;
  supplier_id: string;
  buy_qty: number;
  free_qty: number;
  notes: string | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
}

const EMPTY_FORM = {
  internal_sku: "", external_sku: "", internal_product_name: "", supplier_product_name: "",
  level1_category: "", level2_category: "", level3_category: "",
  accounting_category: "",
  financial_treatment: "" as string,
  default_coa_account_id: "" as string,
  unit: "", unit_cost: "", supplier: "", status: "Active",
  purchase_unit: "", purchase_unit_cost: "",
  stock_uom: "", stock_qty: "1", cost_per_stock_unit: "0",
  base_unit_type: "g", base_unit_qty: "1", cost_per_base_unit: "0",
  notes: "",
  min_stock_qty: "", reorder_qty: "",
  creates_stock_movement: true as boolean,
  purchase_yield: "100",
  cooking_yield: "100",
};

interface FlatRow {
  product: ProductMasterItem;
  supplier_entry: ProductSupplierEntry | null;
  internal_sku: string;
  external_sku: string;
  internal_product_name: string;
  supplier_product_name: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  accounting_category: string;
  financial_treatment: string;
  default_coa_account_id: string | null;
  default_coa_label: string;
  pl_section: string;
  mapping_status: "Mapped" | "Unmapped";
  purchase_unit: string;
  purchase_unit_cost: number;
  stock_uom: string;
  stock_qty: number;
  cost_per_stock_unit: number;
  base_unit_type: string;
  base_unit_qty: number;
  cost_per_base_unit: number;
  supplier: string;
  status: string;
  unit_cost: number;
  notes: string;
  creates_stock_movement: boolean;
  purchase_yield: number;
  cooking_yield: number;
  rowKey: string;
  setup_state: SetupHealthState;
  setup_issues: string[];
  setup_issue_count: number;
}


function SetupStatusBadge({ row }: { row: FlatRow }) {
  if (row.setup_state === "inactive") {
    return <span className="chip chip-neutral">Inactive</span>;
  }
  if (row.setup_state === "complete") {
    return <span className="chip chip-success"><CheckCircle2 className="h-3 w-3" /> Complete</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="chip chip-warn h-5 px-1.5 text-[10px] font-medium gap-1" title="Show setup issues">
          <AlertTriangle className="h-3 w-3" /> {row.setup_issue_count} missing
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="text-xs font-medium mb-1.5">Setup issues</div>
        <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
          {row.setup_issues.map(issue => <li key={issue}>{issue}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// Products list columns (widths are the defaults; people can resize, hide and reset them).
const LIST_COLS: ColumnDef[] = [
  { key: "sku", label: "SKU", width: 90, min: 60 },
  { key: "product", label: "Product", width: 210, min: 120, lockShown: true, grow: true },
  { key: "category", label: "Category", width: 170, min: 80, grow: true },
  { key: "supplier", label: "Supplier", width: 215, min: 130, lockShown: true, grow: true },
  { key: "code", label: "Supplier code", width: 110, min: 70 },
  { key: "bought", label: "Bought as", width: 120, min: 70 },
  { key: "price", label: "Price", width: 85, min: 70 },
  { key: "deal", label: "Deal", width: 110, min: 60 },
  { key: "cost", label: "Cost after deal", width: 125, min: 95 },
  { key: "status", label: "Status", width: 115, min: 85 },
];
const RIGHT = new Set(["price", "cost", "status"]);
const SORTABLE = new Set(["sku", "product", "category", "price", "cost", "status"]);
// Shown once per product; the product's other supplier lines leave them blank.
const PRODUCT_COLS = new Set(["sku", "product", "category", "status"]);

export default function ProductMasterTab({ popup = false }: { popup?: boolean } = {}) {
  const { products, loading, fetchProducts, createProduct, updateProduct, deleteProduct, addSupplier, updateSupplier, deleteSupplier, splitProduct, reassignSupplier, deleteProductIfOrphaned } = useProductMaster();
  const { tenantId } = useActiveTenant();
  const canEditList = useCanEditItemList();
  const blockedEdit = () => { if (canEditList) return false; toast({ title: ITEM_LIST_APPROVER_ONLY, variant: "destructive" }); return true; };
  const { toast } = useToast();
  const [seedingRefunds, setSeedingRefunds] = useState(false);
  const [refundSeedDismissed, setRefundSeedDismissed] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("refund_seed_dismissed") === "true" : true)
  );
  const { items: coaAccounts } = useChartOfAccounts();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [l2Filter, setL2Filter] = useState("all");
  const [subCatFilter, setSubCatFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [setupFilter, setSetupFilter] = useState<SetupHealthState | "all">("all");
  
  const [treatmentFilter, setTreatmentFilter] = useState("all");
  const [mappingFilter, setMappingFilter] = useState("all");
  const [showLegacyCols, setShowLegacyCols] = useState(false);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([
    { key: "mapping_status", dir: "asc" },
    { key: "internal_product_name", dir: "asc" },
  ]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [view, setView] = useState<"all" | "needs" | "inactive">("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<FlatRow | null>(null);
  // Item page: which card is being edited (null = reading).
  const [editCard, setEditCard] = useState<string | null>(null);
  const [accountKeys, setAccountKeys] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingSupplierEntryId, setEditingSupplierEntryId] = useState<string | null>(null);
  const [originalSku, setOriginalSku] = useState<string>("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<FlatRow | null>(null);
  const [dbSuppliers, setDbSuppliers] = useState<{ id: string; name: string }[]>([]);
  // Every item deal for the client (buy X get Y, discount), shown in the Deal column.
  const [allDeals, setAllDeals] = useState<any[]>([]);
  const loadAllDeals = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("item_supplier_deals" as any).select("id, product_id, supplier_id, deal_type, buy_qty, free_qty, discount_percent, special_price, valid_from, valid_until, is_active").eq("tenant_id", tenantId).eq("is_active", true);
    setAllDeals((data as any[]) ?? []);
  }, [tenantId]);
  useEffect(() => { void loadAllDeals(); }, [loadAllDeals]);
  const today = hongKongDate();
  const [duplicateSku, setDuplicateSku] = useState<string | null>(null);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  // Columns: defaults below; each person's widths and hidden columns are kept for them (Columns › Reset columns).
  // Fewer columns when the page area (not the screen) is narrow, e.g. Settings beside the sidebar on a tablet.
  const rootRef = useRef<HTMLDivElement>(null);
  const [isTablet, setIsTablet] = useState(false);
  const [areaW, setAreaW] = useState(1400);
  // Default columns fit the page area: Supplier code goes first, then Category (a person's own choice wins).
  const defaultHidden = useMemo(() => [...(areaW < 1250 ? ["code"] : []), ...(areaW < 1120 ? ["category"] : [])], [areaW]);
  const colLayout = useColumnLayout("products-list", user?.id, LIST_COLS, defaultHidden);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { setIsTablet(el.clientWidth < 1000); setAreaW(Math.round(el.clientWidth / 50) * 50); });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Supplier deals (within edit panel)
  const [deals, setDeals] = useState<SupplierDealRow[]>([]);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<SupplierDealEditable | null>(null);

  const loadDeals = useCallback(async (productId: string) => {
    if (!tenantId || !productId) { setDeals([]); return; }
    const { data } = await supabase
      .from("item_supplier_deals" as any)
      .select("id, supplier_id, deal_type, buy_qty, free_qty, discount_percent, special_price, notes, is_active, valid_from, valid_until")
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    setDeals(((data as any[]) || []) as SupplierDealRow[]);
  }, [tenantId]);

  useEffect(() => {
    if (dialogOpen && editingProductId) {
      loadDeals(editingProductId);
    } else if (!dialogOpen) {
      setDeals([]);
    }
  }, [dialogOpen, editingProductId, loadDeals]);

  const handleDeleteDeal = async (dealId: string) => {
    if (!tenantId || blockedEdit()) return;
    const { error } = await supabase
      .from("item_supplier_deals" as any)
      .update({ is_active: false })
      .eq("id", dealId)
      .eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Could not delete deal", description: error.message, variant: "destructive" });
      return;
    }
    if (editingProductId) loadDeals(editingProductId);
  };

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name").then(({ data }) => {
      setDbSuppliers((data || []) as { id: string; name: string }[]);
    });
  }, [tenantId]);

  const coaById = useMemo(() => {
    const m = new Map<string, { code: string; name: string; account_type: string }>();
    coaAccounts.forEach(a => m.set(a.id, { code: a.code, name: a.name, account_type: a.account_type }));
    return m;
  }, [coaAccounts]);

  const coaLabel = (id: string | null | undefined) => {
    if (!id) return "";
    const a = coaById.get(id);
    return a ? `${a.code} – ${a.name}` : "";
  };

  const categories = useMemo(() => [...new Set(products.map(p => p.level1_category))].filter(Boolean).sort(), [products]);
  const l2Categories = useMemo(() => {
    const filtered = catFilter !== "all" ? products.filter(p => p.level1_category === catFilter) : products;
    return [...new Set(filtered.map(p => p.level2_category).filter(Boolean))].sort();
  }, [products, catFilter]);
  const subCategories = useMemo(() => {
    let filtered = products;
    if (catFilter !== "all") filtered = filtered.filter(p => p.level1_category === catFilter);
    if (l2Filter !== "all") filtered = filtered.filter(p => p.level2_category === l2Filter);
    return [...new Set(filtered.map(p => p.level3_category).filter(Boolean))].sort();
  }, [products, catFilter, l2Filter]);
  const allSuppliers = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      if (p.supplier) s.add(p.supplier);
      p.suppliers?.forEach(ps => { if (ps.supplier) s.add(ps.supplier); });
    });
    return [...s].sort();
  }, [products]);

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    for (const p of products) {
      const treatment = p.financial_treatment || "";
      const coaId = p.default_coa_account_id || null;
      const mapping_status: "Mapped" | "Unmapped" = (treatment && coaId) ? "Mapped" : "Unmapped";
      const baseFinancial = {
        financial_treatment: treatment,
        default_coa_account_id: coaId,
        default_coa_label: coaLabel(coaId),
        pl_section: plSectionFor(treatment),
        mapping_status,
      };
      const sups = p.suppliers && p.suppliers.length > 0 ? p.suppliers : null;
      if (sups) {
        for (const s of sups) {
          const row: FlatRow = {
            product: p, supplier_entry: s, rowKey: `${p.id}-${s.id}`,
            internal_sku: p.internal_sku, external_sku: s.external_sku,
            internal_product_name: p.internal_product_name, supplier_product_name: s.supplier_product_name,
            level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
            accounting_category: ((s as any).accounting_category as string) || ((p as any).accounting_category as string) || "",
            ...baseFinancial,
            purchase_unit: s.purchase_unit, purchase_unit_cost: s.purchase_unit_cost,
            stock_uom: s.stock_uom ?? p.stock_uom, stock_qty: s.stock_qty ?? p.stock_qty, cost_per_stock_unit: s.purchase_unit_cost / ((s.stock_qty ?? p.stock_qty) || 1),
            base_unit_type: s.base_unit_type ?? p.base_unit_type, base_unit_qty: s.base_unit_qty ?? p.base_unit_qty, cost_per_base_unit: s.purchase_unit_cost / ((s.base_unit_qty ?? p.base_unit_qty) || 1),
            supplier: s.supplier, status: p.status, unit_cost: p.unit_cost, notes: p.notes || "",
            creates_stock_movement: p.creates_stock_movement ?? true,
            purchase_yield: p.purchase_yield ?? 100,
            cooking_yield: p.cooking_yield ?? 100,
            setup_state: "complete", setup_issues: [], setup_issue_count: 0,
          };
          const health = computeSetupHealth({
            ...row,
            supplier_scoped: true,
            creates_stock_movement: p.creates_stock_movement,
            purchase_yield: p.purchase_yield,
            cooking_yield: p.cooking_yield,
          });
          row.setup_state = health.state;
          row.setup_issues = health.issues;
          row.setup_issue_count = health.issueCount;
          rows.push(row);
        }
      } else {
        const row: FlatRow = {
          product: p, supplier_entry: null, rowKey: p.id,
          internal_sku: p.internal_sku, external_sku: p.external_sku,
          internal_product_name: p.internal_product_name, supplier_product_name: p.supplier_product_name,
          level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
          accounting_category: ((p as any).accounting_category as string) || "",
          ...baseFinancial,
          purchase_unit: p.purchase_unit, purchase_unit_cost: p.purchase_unit_cost,
          stock_uom: p.stock_uom, stock_qty: p.stock_qty, cost_per_stock_unit: p.cost_per_stock_unit,
          base_unit_type: p.base_unit_type, base_unit_qty: p.base_unit_qty, cost_per_base_unit: p.cost_per_base_unit,
          supplier: p.supplier, status: p.status, unit_cost: p.unit_cost, notes: p.notes || "",
          creates_stock_movement: p.creates_stock_movement ?? true,
          purchase_yield: p.purchase_yield ?? 100,
          cooking_yield: p.cooking_yield ?? 100,
          setup_state: "complete", setup_issues: [], setup_issue_count: 0,
        };
        const health = computeSetupHealth({
          ...row,
          supplier_scoped: false,
          creates_stock_movement: p.creates_stock_movement,
          purchase_yield: p.purchase_yield,
          cooking_yield: p.cooking_yield,
        });
        row.setup_state = health.state;
        row.setup_issues = health.issues;
        row.setup_issue_count = health.issueCount;
        rows.push(row);
      }
    }
    return rows;
  }, [products, coaById]);

  // Category accounts from Purchasing setup: a category (group + level 1) counts as having an account
  // when it has one for every venue or for at least one venue.
  useEffect(() => {
    if (!tenantId) return;
    let on = true;
    void supabase.from("account_mapping_rules" as any).select("rule_type, match_key").eq("tenant_id", tenantId)
      .in("rule_type", ["procurement_category", "procurement_category_venue"]).then(({ data }) => {
        if (!on) return;
        setAccountKeys(new Set(((data as any[]) || []).map(d => String(d.match_key).split("__").slice(0, 2).join("__"))));
      });
    return () => { on = false; };
  }, [tenantId]);
  const needsByRow = useMemo(() => new Map(flatRows.map(r => [r.rowKey, productNeeds({
    supplier: r.supplier, external_sku: r.external_sku, supplier_product_name: r.supplier_product_name,
    level1_category: r.level1_category, financial_treatment: r.financial_treatment,
    has_account: !!r.default_coa_account_id || accountKeys.has(`${r.financial_treatment}__${r.level1_category}`),
    purchase_unit: r.purchase_unit, purchase_unit_cost: r.purchase_unit_cost,
    creates_stock_movement: r.creates_stock_movement, stock_uom: r.stock_uom, stock_qty: r.stock_qty, status: r.status,
  })])), [flatRows, accountKeys]);
  const multiCount = useMemo(() => products.filter(p => (p.suppliers?.length ?? 0) > 1).length, [products]);
  const needsCount = useMemo(() => new Set(flatRows.filter(r => (needsByRow.get(r.rowKey) ?? []).length).map(r => r.product.id)).size, [flatRows, needsByRow]);

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

  const filtered = useMemo(() => {
    let result = flatRows.filter(r => {
      if (catFilter !== "all" && r.level1_category !== catFilter) return false;
      if (l2Filter !== "all" && r.level2_category !== l2Filter) return false;
      if (subCatFilter !== "all" && r.level3_category !== subCatFilter) return false;
      if (supplierFilter !== "all" && r.supplier !== supplierFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (setupFilter !== "all" && r.setup_state !== setupFilter) return false;
      
      if (treatmentFilter !== "all") {
        if (treatmentFilter === "__unmapped__") {
          if (r.financial_treatment) return false;
        } else if (r.financial_treatment !== treatmentFilter) return false;
      }
      if (mappingFilter !== "all" && r.mapping_status !== mappingFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.internal_sku.toLowerCase().includes(q) ||
          r.external_sku.toLowerCase().includes(q) ||
          r.internal_product_name.toLowerCase().includes(q) ||
          r.supplier_product_name.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q);
      }
      return true;
    });
    return sortRows(result, sortColumns);
  }, [flatRows, search, catFilter, l2Filter, subCatFilter, supplierFilter, statusFilter, setupFilter, treatmentFilter, mappingFilter, sortColumns]);

  const listRows = useMemo(() => {
    const rows = filtered.filter(r => view === "all" ? true : view === "inactive" ? r.status !== "Active" : (needsByRow.get(r.rowKey) ?? []).length > 0);
    return [...rows].sort((a, b) => a.internal_product_name.localeCompare(b.internal_product_name) || (a.supplier || "").localeCompare(b.supplier || ""));
  }, [filtered, view, needsByRow]);

  // One group per product: its supplier lines (cheapest after deal first), the cheapest marked, sorted by column.
  const [listSort, setListSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "product", dir: 1 });
  const groups = useMemo(() => {
    const supIdByName = new Map(dbSuppliers.map(x => [x.name, x.id]));
    const by = new Map<string, FlatRow[]>();
    for (const r of listRows) { const a = by.get(r.product.id); if (a) a.push(r); else by.set(r.product.id, [r]); }
    const out = [...by.values()].map(rows => {
      const lines = rows.map(r => {
        const supId = supIdByName.get(r.supplier);
        const deal = supId ? allDeals.find(d => d.product_id === r.product.id && d.supplier_id === supId && dealLive(d, today)) ?? null : null;
        return { r, deal, cost: costAfterDeal(r, deal), needs: needsByRow.get(r.rowKey) ?? [] };
      }).sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || (a.r.supplier || "").localeCompare(b.r.supplier || ""));
      const p = rows[0].product;
      return { id: p.id, p, first: rows[0], lines, cheapest: cheapestIndex(lines.map(l => ({ cost: l.cost, stock_uom: l.r.stock_uom }))),
        best: lines.find(l => l.cost != null)?.cost ?? null, needs: [...new Set(lines.flatMap(l => l.needs))], inactive: !!p.status && p.status !== "Active" };
    });
    const cat = (g: typeof out[number]) => [g.first.level1_category, g.first.level2_category, g.first.level3_category].filter(Boolean).join(" › ");
    const val = (g: typeof out[number]): string | number | null => {
      switch (listSort.key) {
        case "sku": return g.p.internal_sku || "";
        case "category": return cat(g);
        case "price": { const ps = g.lines.map(l => l.r.purchase_unit_cost).filter(n => n > 0); return ps.length ? Math.min(...ps) : null; }
        case "cost": return g.best;
        case "status": return g.inactive ? 2 : g.needs.length ? 0 : 1;
        default: return g.p.internal_product_name || "";
      }
    };
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1; // blanks last either way
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c * listSort.dir || (a.p.internal_product_name || "").localeCompare(b.p.internal_product_name || "");
    });
  }, [listRows, dbSuppliers, allDeals, today, needsByRow, listSort]);
  const downloadList = () => {
              const exportRows = listRows.map(r => {
            const py = Number(r.purchase_yield ?? 100);
            const cy = Number(r.cooking_yield ?? 100);
            const totalYield = (py / 100) * (cy / 100) * 100;
            const effectiveCost = r.cost_per_base_unit > 0 && totalYield > 0
              ? r.cost_per_base_unit / (totalYield / 100)
              : r.cost_per_base_unit;

            return {
              internal_sku:            r.internal_sku,
              internal_product_name:   r.internal_product_name,
              supplier:                r.supplier,
              supplier_product_name:   r.supplier_product_name,
              external_sku:            r.external_sku,
              level1_category:         r.level1_category,
              level2_category:         r.level2_category,
              level3_category:         r.level3_category,
              financial_treatment:     (r as any).financial_treatment,
              coa_account:             (r as any).default_coa_label,
              mapping_status:          (r as any).mapping_status,
              creates_stock_movement:  (((r as any).product?.creates_stock_movement ?? true) ? 'Yes' : 'No'),
              purchase_unit:           r.purchase_unit,
              purchase_unit_cost:      r.purchase_unit_cost.toFixed(2),
              stock_uom:               r.stock_uom,
              stock_qty:               r.stock_qty,
              cost_per_stock_unit:     r.cost_per_stock_unit.toFixed(4),
              base_unit_type:          r.base_unit_type,
              base_unit_qty:           r.base_unit_qty,
              cost_per_base_unit:      r.cost_per_base_unit.toFixed(4),
              purchase_yield:          py,
              cooking_yield:           cy,
              total_yield:             totalYield.toFixed(1),
              effective_cost_per_base: effectiveCost.toFixed(4),
              min_stock_qty:           (r as any).product?.min_stock_qty ?? '',
              reorder_qty:             (r as any).product?.reorder_qty ?? '',
              notes:                   (r as any).notes,
              status:                  r.status,
            };
          });

          downloadCSV(
            exportRows,
            [
              { key: 'internal_sku',            label: 'Internal SKU' },
              { key: 'internal_product_name',   label: 'Product Name' },
              { key: 'supplier',                label: 'Supplier & Vendor' },
              { key: 'supplier_product_name',   label: 'Supplier Product Name' },
              { key: 'external_sku',            label: 'External SKU' },
              { key: 'level1_category',         label: 'L1' },
              { key: 'level2_category',         label: 'L2' },
              { key: 'level3_category',         label: 'L3' },
              { key: 'financial_treatment',     label: 'Financial Treatment' },
              { key: 'coa_account',             label: 'COA Account' },
              { key: 'mapping_status',          label: 'Mapping' },
              { key: 'creates_stock_movement',  label: 'Creates Stock Movement' },
              { key: 'purchase_unit',           label: 'Purch. UOM' },
              { key: 'purchase_unit_cost',      label: 'Purch. Cost' },
              { key: 'stock_uom',               label: 'Stock UOM' },
              { key: 'stock_qty',               label: 'Stock Qty' },
              { key: 'cost_per_stock_unit',     label: 'Cost per Stock Unit' },
              { key: 'base_unit_type',          label: 'Base/Recipe UOM' },
              { key: 'base_unit_qty',           label: 'Base/Recipe Qty' },
              { key: 'cost_per_base_unit',      label: 'Cost per Base Unit' },
              { key: 'purchase_yield',          label: 'Purchase Yield (%)' },
              { key: 'cooking_yield',           label: 'Cooking Yield (%)' },
              { key: 'total_yield',             label: 'Total Yield (%)' },
              { key: 'effective_cost_per_base', label: 'Effective Cost per Base Unit' },
              { key: 'min_stock_qty',           label: 'Min Stock Qty' },
              { key: 'reorder_qty',             label: 'Reorder Qty' },
              { key: 'notes',                   label: 'Notes' },
              { key: 'status',                  label: 'Status' },
            ],
            `product_master_${new Date().toISOString().slice(0, 10)}`
);
  };

  const hasFilters = catFilter !== "all" || l2Filter !== "all" || subCatFilter !== "all" || supplierFilter !== "all" || statusFilter !== "all" || setupFilter !== "all" || treatmentFilter !== "all" || mappingFilter !== "all" || search;
  const clearFilters = () => { setCatFilter("all"); setL2Filter("all"); setSubCatFilter("all"); setSupplierFilter("all"); setStatusFilter("all"); setSetupFilter("all"); setTreatmentFilter("all"); setMappingFilter("all"); setSearch(""); };

  // Collect legacy free-text UOMs from existing products so dropdowns still display them.
  const legacyPurchaseUoms = useMemo(() => flatRows.map(r => r.purchase_unit), [flatRows]);
  const legacyStockUoms = useMemo(() => flatRows.map(r => r.stock_uom), [flatRows]);
  const legacyBaseUoms = useMemo(() => flatRows.map(r => r.base_unit_type), [flatRows]);

  // Duplicate SKU detection for create mode
  useEffect(() => {
    const sku = form.internal_sku.trim();
    if (!sku) { setDuplicateSku(null); return; }
    // When editing, only warn if SKU changed to a *different* existing product
    if (editingProductId && sku === originalSku) { setDuplicateSku(null); return; }
    const matched = products.find(p => p.internal_sku === sku && p.id !== editingProductId);
    setDuplicateSku(matched ? matched.internal_product_name : null);
  }, [form.internal_sku, editingProductId, originalSku, products]);

  const openCreate = () => {
    setEditingProductId(null);
    setEditingSupplierEntryId(null);
    setForm(EMPTY_FORM);
    setDuplicateSku(null);
    setDuplicateSku(null);
    setDialogOpen(true);
  };

  const openEdit = (row: FlatRow) => {
    setEditingRow(row);
    setEditingProductId(row.product.id);
    setEditingSupplierEntryId(row.supplier_entry?.id || null);
    setOriginalSku(row.internal_sku);
    setForm({
      internal_sku: row.internal_sku, external_sku: row.external_sku,
      internal_product_name: row.internal_product_name, supplier_product_name: row.supplier_product_name,
      level1_category: row.level1_category, level2_category: row.level2_category, level3_category: row.level3_category,
      accounting_category: row.accounting_category,
      financial_treatment: row.financial_treatment || "",
      default_coa_account_id: row.default_coa_account_id || "",
      unit: row.product.unit, unit_cost: String(row.unit_cost), supplier: row.supplier, status: row.status,
      purchase_unit: row.purchase_unit, purchase_unit_cost: String(row.purchase_unit_cost),
      stock_uom: row.stock_uom, stock_qty: String(row.stock_qty), cost_per_stock_unit: String(row.cost_per_stock_unit),
      base_unit_type: row.base_unit_type, base_unit_qty: String(row.base_unit_qty),
      cost_per_base_unit: String(row.cost_per_base_unit),
      notes: row.notes,
      min_stock_qty: (row.product as any).min_stock_qty != null ? String((row.product as any).min_stock_qty) : "",
      reorder_qty: (row.product as any).reorder_qty != null ? String((row.product as any).reorder_qty) : "",
      creates_stock_movement: row.creates_stock_movement,
      purchase_yield: String(row.purchase_yield ?? 100),
      cooking_yield: String(row.cooking_yield ?? 100),
    });
    setDialogOpen(true);
  };



  const attemptSave = () => {
    if (duplicateSku !== null) {
      setConfirmDuplicateOpen(true);
      return;
    }
    handleSave();
  };

  const handleSave = async () => {
    setConfirmDuplicateOpen(false);
    if (blockedEdit()) return;

    // Yield validation (only relevant when item creates stock movement, but we sanitise regardless)
    const py = parseFloat(form.purchase_yield);
    const cy = parseFloat(form.cooking_yield);
    if (isNaN(py) || py < 1 || py > 100) {
      toast({ title: "Invalid yield", description: "Purchase yield must be between 1% and 100%", variant: "destructive" });
      return;
    }
    if (isNaN(cy) || cy < 1 || cy > 100) {
      toast({ title: "Invalid yield", description: "Cooking yield must be between 1% and 100%", variant: "destructive" });
      return;
    }

    const purchaseUnitCost = parseFloat(form.purchase_unit_cost) || 0;
    const stockQty = parseFloat(form.stock_qty) || 1;
    const costPerStockUnit = stockQty > 0 ? purchaseUnitCost / stockQty : 0;
    const recipeQty = parseFloat(form.base_unit_qty) || 1;
    const costPerRecipeUnit = recipeQty > 0 ? purchaseUnitCost / recipeQty : 0;

    if (editingProductId) {
      let failed = false;
      const pmUpdates: any = {
        internal_sku: form.internal_sku, internal_product_name: form.internal_product_name,
        level1_category: form.level1_category, level2_category: form.level2_category, level3_category: form.level3_category,
        accounting_category: form.accounting_category,
        financial_treatment: form.financial_treatment,
        default_coa_account_id: form.default_coa_account_id || null,
        unit: form.stock_uom, unit_cost: parseFloat(form.unit_cost) || 0, status: form.status,
        notes: form.notes,
        min_stock_qty: form.min_stock_qty === "" ? null : parseFloat(form.min_stock_qty),
        reorder_qty: form.reorder_qty === "" ? null : parseFloat(form.reorder_qty),
        creates_stock_movement: form.creates_stock_movement,
        purchase_yield: py,
        cooking_yield: cy,
      };


      const supplierLevelFields = {
        supplier: form.supplier, external_sku: form.external_sku,
        supplier_product_name: form.supplier_product_name,
        accounting_category: form.accounting_category,
        purchase_unit: form.purchase_unit, purchase_unit_cost: purchaseUnitCost,
        stock_uom: form.stock_uom, stock_qty: stockQty,
        base_unit_type: form.base_unit_type, base_unit_qty: recipeQty,
        status: form.status,
      };

      // Check if SKU changed and product is shared by multiple supplier entries
      const editedProduct = products.find(p => p.id === editingProductId);
      const isShared = editedProduct && (editedProduct.suppliers?.length ?? 0) > 1;
      const skuChanged = form.internal_sku !== originalSku;

      // Merge-on-SKU-match: if SKU changed to one that already exists on a different product_master
      const existingMatch = skuChanged
        ? products.find(p => p.internal_sku === form.internal_sku && p.id !== editingProductId)
        : null;

      if (existingMatch && editingSupplierEntryId) {
        await reassignSupplier(editingSupplierEntryId, existingMatch.id);
        await updateSupplier(editingSupplierEntryId, supplierLevelFields);
        await deleteProductIfOrphaned(editingProductId);
      } else if (skuChanged && isShared && editingSupplierEntryId) {
        await splitProduct(editingProductId, editingSupplierEntryId, pmUpdates);
      } else {
        // Update product_master
        const { error: pmErr } = await supabase.from("product_master" as any).update(pmUpdates as any).eq("id", editingProductId);
        if (pmErr) { failed = true; toast({ title: "Couldn't save the item", description: pmErr.message, variant: "destructive" }); }
        // Update supplier entry if present
        if (editingSupplierEntryId) {
          const { error: psErr } = await supabase.from("product_suppliers" as any).update(supplierLevelFields as any).eq("id", editingSupplierEntryId);
          if (psErr) { failed = true; toast({ title: "Couldn't save the supplier", description: psErr.message, variant: "destructive" }); }
        } else {
          // Orphan product (no supplier row yet) — auto-create one if any supplier-level data was entered
          const hasSupplierData =
            !!supplierLevelFields.supplier ||
            !!supplierLevelFields.external_sku ||
            !!supplierLevelFields.supplier_product_name ||
            (supplierLevelFields.purchase_unit_cost ?? 0) > 0;
          if (hasSupplierData) {
            const { error: psErr } = await supabase
              .from("product_suppliers" as any)
              .insert({ ...supplierLevelFields, product_master_id: editingProductId, tenant_id: tenantId } as any);
            if (psErr) { failed = true; toast({ title: "Couldn't add the supplier", description: psErr.message, variant: "destructive" }); }
          }
        }
        // Single fetch after both updates are committed
        await fetchProducts();
      }
      if (!failed) { setEditCard(null); toast({ title: "Saved" }); }
    } else {
      const toNumOrNull = (v: string) => {
        if (v === "" || v == null) return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      };
      const data = {
        ...form,
        default_coa_account_id: form.default_coa_account_id || null,
        unit: form.stock_uom,
        unit_cost: parseFloat(form.unit_cost) || 0,
        purchase_unit_cost: purchaseUnitCost,
        stock_qty: stockQty, cost_per_stock_unit: costPerStockUnit,
        base_unit_qty: recipeQty, cost_per_base_unit: costPerRecipeUnit,
        min_stock_qty: toNumOrNull(form.min_stock_qty),
        reorder_qty: toNumOrNull(form.reorder_qty),
        purchase_yield: py,
        cooking_yield: cy,
      };
      const ok = await createProduct(data as any);
      if (ok) setDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    if (blockedEdit()) return;
    if (deletingRow.supplier_entry) {
      const supplierCount = deletingRow.product.suppliers?.length || 0;
      if (supplierCount > 1) {
        await deleteSupplier(deletingRow.supplier_entry.id);
      } else {
        await deleteProduct(deletingRow.product.id);
      }
    } else {
      await deleteProduct(deletingRow.product.id);
    }
    setDeleteOpen(false);
    setDeletingRow(null);
    setDialogOpen(false);
    setEditCard(null);
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt4 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  const liveCostPerStock = (() => {
    const puc = parseFloat(form.purchase_unit_cost) || 0;
    const sq = parseFloat(form.stock_qty) || 1;
    return sq > 0 ? puc / sq : 0;
  })();

  const liveCostPerRecipe = (() => {
    const puc = parseFloat(form.purchase_unit_cost) || 0;
    const rq = parseFloat(form.base_unit_qty) || 1;
    return rq > 0 ? puc / rq : 0;
  })();

  const editingSetupHealth = useMemo(() => {
    if (!editingProductId) return null;
    return computeSetupHealth({
      internal_sku: form.internal_sku, internal_product_name: form.internal_product_name,
      supplier: form.supplier, supplier_product_name: form.supplier_product_name,
      supplier_scoped: Boolean(editingSupplierEntryId || form.supplier.trim()),
      level1_category: form.level1_category, level2_category: form.level2_category, level3_category: form.level3_category,
      financial_treatment: form.financial_treatment, default_coa_account_id: form.default_coa_account_id || null,
      purchase_unit: form.purchase_unit,
      purchase_unit_cost: form.purchase_unit_cost === "" ? null : Number(form.purchase_unit_cost),
      creates_stock_movement: form.creates_stock_movement, stock_uom: form.stock_uom,
      stock_qty: form.stock_qty === "" ? null : Number(form.stock_qty),
      base_unit_type: form.base_unit_type,
      base_unit_qty: form.base_unit_qty === "" ? null : Number(form.base_unit_qty),
      purchase_yield: form.purchase_yield === "" ? null : Number(form.purchase_yield),
      cooking_yield: form.cooking_yield === "" ? null : Number(form.cooking_yield), status: form.status,
    });
  }, [editingProductId, editingSupplierEntryId, form]);

  const baseColumns = [
    { key: "internal_product_name", label: "Product Name" },
    { key: "supplier", label: "Supplier & Vendor" },
    { key: "level1_category", label: "L1" },
    { key: "level2_category", label: "L2" },
    { key: "level3_category", label: "L3" },
    { key: "financial_treatment", label: "Financial Treatment" },
    { key: "mapping_status", label: "Mapping" },
    { key: "setup_state", label: "Setup" },
    { key: "status", label: "Active" },
  ];
  const legacyColumns = [
    { key: "internal_sku", label: "Internal SKU" },
    { key: "external_sku", label: "External SKU" },
    { key: "supplier_product_name", label: "Supplier Product Name" },
    { key: "purchase_unit", label: "Purch. UOM" },
    { key: "purchase_unit_cost", label: "Purch. Cost", align: "right" as const },
    { key: "stock_uom", label: "Stock UOM" },
    { key: "stock_qty", label: "Stock Qty", align: "right" as const },
    { key: "base_unit_type", label: "Recipe UOM" },
    { key: "base_unit_qty", label: "Recipe Qty", align: "right" as const },
  ];
  const columns = showLegacyCols ? [...baseColumns, ...legacyColumns] : baseColumns;
  const GRID_COLS = showLegacyCols
    ? "minmax(200px,1.5fr) 130px 100px 100px 100px 180px 110px 80px 100px 110px minmax(160px,1.2fr) 100px 100px 100px 90px 100px 90px 70px"
    : "minmax(220px,1.6fr) 140px 110px 110px 110px 200px 110px 90px 70px";

  if (loading) return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[0,1,2,3].map(i => <div key={i} className="h-[52px] rounded-lg bg-muted/30 animate-pulse" />)}
      </div>
      <div className="h-10 bg-muted/20 rounded animate-pulse" />
      {[0,1,2,3,4,5].map(i => <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />)}
    </div>
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageGroups = groups.slice(pageStart, pageStart + pageSize);
  const rangeStart = groups.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(groups.length, pageStart + pageSize);
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); return pages; }
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const s = Math.max(2, currentPage - 1);
    const e = Math.min(totalPages - 1, currentPage + 1);
    for (let i = s; i <= e; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  const activeFilterCount =
    (catFilter !== "all" ? 1 : 0) +
    (l2Filter !== "all" ? 1 : 0) +
    (subCatFilter !== "all" ? 1 : 0) +
    (supplierFilter !== "all" ? 1 : 0) +
    (setupFilter !== "all" ? 1 : 0) +
    (treatmentFilter !== "all" ? 1 : 0) +
    (mappingFilter !== "all" ? 1 : 0);

  const SORT_LABELS: Record<string, string> = Object.fromEntries(columns.map(c => [c.key, c.label]));
  const primarySort = sortColumns[0];

  const hasRefundItems = products.some(p => p.internal_sku?.startsWith("REF-"));
  const showRefundSeedBanner = !refundSeedDismissed && !hasRefundItems && !loading && canEditList === true;

  const dismissSeedBanner = () => {
    localStorage.setItem("refund_seed_dismissed", "true");
    setRefundSeedDismissed(true);
  };

  const seedRefundItems = async () => {
    if (!tenantId || seedingRefunds || blockedEdit()) return;
    setSeedingRefunds(true);
    const refundItems = [
      { internal_sku: "REF-0001", internal_product_name: "Price correction" },
      { internal_sku: "REF-0002", internal_product_name: "Short delivery credit" },
      { internal_sku: "REF-0003", internal_product_name: "Quality rejection credit" },
      { internal_sku: "REF-0004", internal_product_name: "Damaged goods credit" },
      { internal_sku: "REF-0005", internal_product_name: "Promotional rebate" },
      { internal_sku: "REF-0006", internal_product_name: "Volume rebate" },
      { internal_sku: "REF-0007", internal_product_name: "General supplier refund" },
    ];
    try {
      const payload = refundItems.map(r => ({
        internal_sku: r.internal_sku,
        external_sku: "",
        internal_product_name: r.internal_product_name,
        supplier_product_name: "",
        level1_category: "Supplier Refunds",
        level2_category: "",
        level3_category: "",
        accounting_category: "purchases",
        financial_treatment: "COGS",
        default_coa_account_id: null,
        unit: "",
        unit_cost: 0,
        purchase_unit: "",
        purchase_unit_cost: 0,
        stock_uom: "",
        stock_qty: 0,
        cost_per_stock_unit: 0,
        base_unit_type: "",
        base_unit_qty: 0,
        cost_per_base_unit: 0,
        notes: "",
        status: "Active",
        creates_stock_movement: false,
        min_stock_qty: null,
        reorder_qty: null,
        tenant_id: tenantId,
      }));
      const { error } = await supabase.from("product_master" as any).insert(payload as any);
      if (error) throw error;
      toast({ title: "Refund items added", description: `Created ${payload.length} standard refund items.` });
      await fetchProducts();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to seed refund items", variant: "destructive" });
    } finally {
      setSeedingRefunds(false);
    }
  };

  // Supplier filter: shows only that supplier's lines (one per product).
  const supplierPick = (
    <Select value={supplierFilter} onValueChange={v => { setSupplierFilter(v); setPage(1); }}>
      <SelectTrigger aria-label="Supplier" className={cn("h-9 w-auto gap-1 text-[13px]", "h-8 max-w-[200px] border-none bg-transparent px-3 shadow-none", supplierFilter !== "all" && "bg-secondary")}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">All suppliers</SelectItem>{allSuppliers.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div ref={rootRef} className="space-y-4">
      {!dialogOpen && (<>
      {/* Same layout as Settings › Suppliers: summary, view buttons, search, upload/download, add. */}
      <p className="text-[13px] text-muted-foreground tabular-nums">
        {products.length.toLocaleString()} items{multiCount > 0 && <> · {multiCount.toLocaleString()} from more than one supplier</>}{needsCount > 0 && <> · <span className="text-[hsl(var(--warning))]">{needsCount.toLocaleString()} need setup</span></>}
      </p>
      <div className={cn("flex items-center gap-1.5", isMobile && "flex-col items-stretch gap-2")}>
        {isMobile && (
          <div className="flex gap-1.5">
            <Input aria-label="Search items" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className="h-9 min-w-0 flex-1 text-[13px]" />
            {canEditList && <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Upload items" title="Upload items" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /></Button>}
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Download" title="Download" onClick={downloadList}><Download className="h-4 w-4" /></Button>
          </div>
        )}
        <div className="flex items-center gap-1">
          {([["all", "All"], ["needs", "Needs setup"], ["inactive", "Inactive"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={view === k ? "secondary" : "ghost"} aria-pressed={view === k} className="h-8 whitespace-nowrap px-3" onClick={() => { setView(k); setPage(1); }}>{l}</Button>
          ))}
          {!isMobile && supplierPick}
          {isMobile && <span className="flex-1" />}
          {isMobile && canEditList && <Button size="sm" className="h-8" onClick={openCreate}>Add</Button>}
        </div>
        {isMobile && <div className="-mt-1">{supplierPick}</div>}
        {!isMobile && (
          <div className="ml-auto flex items-center gap-1.5">
            <Input aria-label="Search items" placeholder={isTablet ? "Search" : "Search items, suppliers or codes"} value={search} onChange={e => setSearch(e.target.value)} className={cn("h-9 text-[13px]", isTablet ? "w-[200px]" : "w-[280px]")} />
            {canEditList && <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Upload items" title="Upload items" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /></Button>}
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Download" title="Download" onClick={downloadList}><Download className="h-4 w-4" /></Button>
            <ColumnsButton cols={LIST_COLS} hidden={colLayout.hidden} onToggle={colLayout.toggle} onReset={colLayout.reset} changed={colLayout.changed} />
            {canEditList && <Button size="sm" className="h-9" onClick={openCreate}>{isTablet ? "Add" : "Add product"}</Button>}
          </div>
        )}
      </div>

      {isMobile ? (
        <div className="border-t border-border">
          {pageGroups.length === 0 && <p className="py-10 text-center text-[13px] text-muted-foreground">No products found.</p>}
          {pageGroups.map(g => (
            <div key={g.id} className={cn("border-b border-border py-2.5", g.inactive && "opacity-60")}>
              <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left" onClick={() => openEdit(g.first)}>
                <span className="min-w-0 truncate text-[14px] font-medium" title={g.p.internal_product_name}>{g.p.internal_product_name}</span>
                <span className={cn("shrink-0 text-[12px]", g.needs.length && !g.inactive ? "text-[hsl(var(--warning))]" : "text-muted-foreground")}>{g.inactive ? "Inactive" : g.needs.length ? "Needs setup" : "Ready"}</span>
              </button>
              <div className="text-[12px] text-muted-foreground">{g.p.internal_sku}</div>
              {g.lines.map((l, i) => (
                <button key={l.r.rowKey} type="button" className="mt-1 flex w-full items-start justify-between gap-3 text-left text-[13px]" onClick={() => openEdit(l.r)}>
                  <span className="min-w-0">
                    <span className="block truncate">{l.r.supplier || <span className="text-[hsl(var(--warning))]">No supplier</span>}{g.cheapest === i && <span className="ml-1.5 rounded-md bg-[#E4F1EC] px-1.5 py-px text-[11px] text-[#1F6B5E]">Cheapest</span>}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{boughtAs(l.r.purchase_unit, l.r.stock_qty, l.r.stock_uom) || <span className="text-[hsl(var(--warning))]">No unit</span>}{l.deal && <span className="text-[#2F7A5E]"> · {dealLabel(l.deal, l.r.purchase_unit_cost)}</span>}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block">{l.r.purchase_unit_cost > 0 ? fmt(l.r.purchase_unit_cost) : <span className="text-[hsl(var(--warning))]">No price</span>}</span>
                    <span className="block text-[12px] text-muted-foreground">{l.cost != null ? `${fmt(l.cost)} / ${l.r.stock_uom}` : "—"}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Products table">
          {/* One product, its suppliers on the lines below (named once). Drag a header edge to resize; Columns hides or resets. */}
          <table className="sales-table kit-resizable" aria-label="Products" style={colLayout.tableStyle}>
            <colgroup>{colLayout.shown.map(c => <col key={c.key} data-col={c.key} style={{ width: colLayout.colWidth(c) }} />)}</colgroup>
            <thead><tr>
              {colLayout.shown.map(c => {
                const sortable = SORTABLE.has(c.key);
                const on = listSort.key === c.key;
                return (
                  <th key={c.key} scope="col" data-col={c.key} className={RIGHT.has(c.key) ? "sales-cell-right" : "sales-cell-left"}
                    aria-sort={on ? (listSort.dir === 1 ? "ascending" : "descending") : undefined}>
                    {sortable
                      ? <button type="button" className="inline-flex max-w-full items-center gap-1 truncate" onClick={() => setListSort(on ? { key: c.key, dir: listSort.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}>
                          <span className="truncate">{c.label}</span>{on && (listSort.dir === 1 ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
                        </button>
                      : c.label}
                    <ResizeHandle colKey={c.key} label={c.label} width={colLayout.widthOf(c)} min={c.min} onResize={(w, now) => colLayout.setWidth(c.key, w, now)} />
                  </th>
                );
              })}
            </tr></thead>
            <tbody>
              {pageGroups.length === 0 && <tr><td colSpan={colLayout.shown.length} className="py-10 text-center text-muted-foreground">No products found.</td></tr>}
              {pageGroups.map(g => g.lines.map((l, i) => {
                const r = l.r;
                const warn = (t: string) => <span className="text-[hsl(var(--warning))]">{t}</span>;
                const catPath = [r.level1_category, r.level2_category, r.level3_category].filter(Boolean).join(" › ");
                const cell = (key: string): { v: React.ReactNode; t?: string } => {
                  if (i > 0 && PRODUCT_COLS.has(key)) return { v: null };
                  switch (key) {
                    case "sku": return { v: <span className="text-muted-foreground">{r.internal_sku}</span>, t: r.internal_sku };
                    case "product": return { v: <span className="font-medium">{r.internal_product_name}</span>, t: r.internal_product_name };
                    case "category": return { v: catPath || warn("Not set"), t: catPath };
                    case "supplier": return { v: <span className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate">{r.supplier || warn("Not set")}</span>{g.cheapest === i && <span className="shrink-0 rounded-md bg-[#E4F1EC] px-1.5 py-px text-[11px] text-[#1F6B5E]">Cheapest</span>}</span>, t: g.cheapest === i ? `${r.supplier} · cheapest after deals` : r.supplier };
                    case "code": return { v: <span className="text-muted-foreground">{r.external_sku || "—"}</span>, t: [r.external_sku, r.supplier_product_name].filter(Boolean).join(" · ") };
                    case "bought": { const b = boughtAs(r.purchase_unit, r.stock_qty, r.stock_uom); return { v: b || warn("No unit"), t: b }; }
                    case "price": return { v: r.purchase_unit_cost > 0 ? fmt(r.purchase_unit_cost) : warn("Not set") };
                    case "deal": { const d = l.deal ? dealLabel(l.deal, r.purchase_unit_cost) : ""; return { v: d ? <span className="text-[#2F7A5E]">{d}</span> : <span className="text-muted-foreground">—</span>, t: d }; }
                    case "cost": return { v: l.cost != null ? <span className="font-medium">{fmt(l.cost)} <span className="font-normal text-muted-foreground">/ {r.stock_uom}</span></span> : <span className="text-muted-foreground">—</span> };
                    case "status": return g.inactive ? { v: "Inactive" } : g.needs.length ? { v: warn("Needs setup"), t: needsText(g.needs) } : { v: "Ready" };
                    default: return { v: null };
                  }
                };
                return (
                  <tr key={r.rowKey} className={cn("sales-record-row", g.inactive && "sales-closed-row", i < g.lines.length - 1 && "kit-group-mid")} onClick={() => openEdit(r)}>
                    {colLayout.shown.map(c => { const { v, t } = cell(c.key); return (
                      <td key={c.key} data-col={c.key} className={RIGHT.has(c.key) ? "kit-num" : "sales-cell-left"} style={fitCell} title={t || undefined}>{v}</td>
                    ); })}
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <span className="tabular-nums">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {groups.length.toLocaleString()} products</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tabular-nums">{currentPage} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      </>)}

      <ItemsUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onDone={fetchProducts} />

      {/* Item page (no side panel): read-first cards with one Edit each; a new item opens with every card editable. */}
      {dialogOpen && (() => {
        const isNew = !editingProductId;
        const prod = editingProductId ? products.find(p => p.id === editingProductId) ?? null : null;
        const needs = editingRow ? needsByRow.get(editingRow.rowKey) ?? [] : [];
        const editing = (k: string) => isNew || editCard === k;
        const reset = () => { if (editingRow) openEdit(editingRow); };
        const startEdit = (k: string) => { if (editCard && editCard !== k) reset(); setEditCard(k); };
        const cancelEdit = () => { reset(); setEditCard(null); };
        const kv = (label: string, value: React.ReactNode, missing = "Not set") => (
          <div className="min-w-0"><div className="text-[11.5px] text-muted-foreground">{label}</div>
            <div className={cn("mt-0.5 truncate text-[14px]", !value && value !== 0 && "text-[hsl(var(--warning))]")}>{value || value === 0 ? value : missing}</div></div>);
        const grid = (children: React.ReactNode) => <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>;
        const card = (key: string, title: string, view: React.ReactNode, edit: React.ReactNode, action?: React.ReactNode) => (
          <section className="rounded-2xl border border-border bg-card p-5" aria-label={title}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold">{title}</h3>
              {!isNew && canEditList && !editing(key) && (action ?? <button type="button" className="text-[13px] text-[#1F6B5E]" onClick={() => startEdit(key)}>Edit</button>)}
            </div>
            {editing(key) ? <div className="space-y-3">{edit}
              {!isNew && <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={cancelEdit}>Cancel</Button><Button onClick={attemptSave} disabled={!form.internal_sku.trim() || !form.internal_product_name.trim()}>Save</Button></div>}
            </div> : view}
          </section>);
        const cat = [form.level1_category, form.level2_category, form.level3_category].filter(Boolean).join(" › ");
        const acct = form.default_coa_account_id ? coaById.get(form.default_coa_account_id) : null;
        const fromSetup = !acct && accountKeys.has(`${form.financial_treatment}__${form.level1_category}`);
        // Each supplier with its live deal and cost per stock unit after it, cheapest first.
        const supIdByName = new Map(dbSuppliers.map(x => [x.name, x.id]));
        const supLines = (prod?.suppliers ?? []).map(sp => {
          const id = supIdByName.get(sp.supplier);
          const deal = id ? allDeals.find(d => d.product_id === prod?.id && d.supplier_id === id && dealLive(d, today)) ?? null : null;
          return { sp, deal, cost: costAfterDeal({ purchase_unit: sp.purchase_unit, purchase_unit_cost: sp.purchase_unit_cost, stock_qty: sp.stock_qty, stock_uom: sp.stock_uom }, deal) };
        }).sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
        const cheapestAt = cheapestIndex(supLines.map(l => ({ cost: l.cost, stock_uom: l.sp.stock_uom })));
        const sups = supLines.map(l => l.sp);
        const tag = <span className="ml-1.5 rounded-md bg-[#E4F1EC] px-1.5 py-px text-[11px] font-normal text-[#1F6B5E]">Cheapest</span>;
        const openSupplier = (id: string) => {
          const row = flatRows.find(r => r.product.id === prod?.id && r.supplier_entry?.id === id);
          if (row) { openEdit(row); setEditCard("supplier"); }
        };
        return (
          <div className="space-y-3">
            <div>
              <button type="button" className="text-[13px] text-[#1F6B5E]" onClick={() => { setDialogOpen(false); setEditCard(null); }}>‹ Products</button>
              <h2 className="mt-1 truncate text-[22px] font-semibold">{isNew ? "New product" : form.internal_product_name || "Product"}</h2>
              {!isNew && <p className="truncate text-[13px] text-muted-foreground">{[form.internal_sku, form.supplier].filter(Boolean).join(" · ")}{needs.length > 0 && <> · <span className="text-[hsl(var(--warning))]">{needsText(needs)}</span></>}</p>}
            </div>
            {duplicateSku !== null && <p className="text-[13px] text-[hsl(var(--warning))]">SKU "{form.internal_sku}" is already {duplicateSku}. Saving adds this supplier to that item.</p>}

            {card("item", "Item",
              grid(<>{kv("SKU", form.internal_sku)}{kv("Name", form.internal_product_name)}{kv("Status", form.status)}<div className="col-span-2 sm:col-span-3">{kv("Category", cat, "No category")}</div></>),
              <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Internal SKU *</Label>
                      <Input value={form.internal_sku} onChange={e => setForm({ ...form, internal_sku: e.target.value })}
                        className={cn("h-9 text-sm font-mono", duplicateSku !== null && "border-warning")} />
                    </div>
                    {form.creates_stock_movement && (
                      <div>
                        <Label className="text-xs">External SKU</Label>
                        <Input value={form.external_sku} onChange={e => setForm({ ...form, external_sku: e.target.value })} className="h-9 text-sm font-mono" />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Internal Product Name *</Label>
                      <Input value={form.internal_product_name} onChange={e => setForm({ ...form, internal_product_name: e.target.value })} className="h-9 text-sm" />
                    </div>
                    {form.creates_stock_movement && (
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Supplier Product Name</Label>
                        <Input value={form.supplier_product_name} onChange={e => setForm({ ...form, supplier_product_name: e.target.value })} className="h-9 text-sm" />
                      </div>
                    )}
                  </div>
                
                  <Label className="text-xs">Categories (L1 → L2 → L3)</Label>
                  <div className="mt-1">
                    <CategoryCascadeSelect
                      level1={form.level1_category}
                      level2={form.level2_category}
                      level3={form.level3_category}
                      onChange={(v) => setForm({ ...form, level1_category: v.level1, level2_category: v.level2, level3_category: v.level3 })}
                    />
                  </div>
                
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." className="text-sm h-20" />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>)}

            {!isNew && card("supplier", editCard === "supplier" ? `Supplier: ${form.supplier || "—"}` : "Suppliers",
              sups.length === 0 ? <p className="text-[13px] text-[hsl(var(--warning))]">No supplier yet.</p> : isMobile
                ? <div className="border-t border-border">{supLines.map(({ sp, deal, cost }, i) => (
                    <button key={sp.id} type="button" disabled={!canEditList} className="flex min-h-[48px] w-full items-center justify-between gap-3 border-b border-border/60 py-1.5 text-left" onClick={() => openSupplier(sp.id)}>
                      <span className="min-w-0"><span className="block truncate text-[14px]">{sp.supplier || "—"}{cheapestAt === i && tag}</span><span className="block truncate text-[12px] text-muted-foreground">{[sp.external_sku || sp.supplier_product_name || "No code", boughtAs(sp.purchase_unit, sp.stock_qty, sp.stock_uom)].filter(Boolean).join(" · ")}{deal && <span className="text-[#2F7A5E]"> · {dealLabel(deal, sp.purchase_unit_cost)}</span>}</span></span>
                      <span className="shrink-0 text-right tabular-nums"><span className="block text-[14px]">{sp.purchase_unit_cost > 0 ? fmt(sp.purchase_unit_cost) : "—"}</span><span className="block text-[12px] text-muted-foreground">{cost != null ? `${fmt(cost)} / ${sp.stock_uom}` : "—"}</span></span>
                    </button>))}</div>
                : <div className="overflow-x-auto"><table className="w-full text-[13px]">
                    <thead className="border-b border-border text-[12px] text-muted-foreground"><tr><th className="h-9 pr-3 text-left font-normal">Supplier</th><th className="pr-3 text-left font-normal">Supplier code</th><th className="pr-3 text-left font-normal">Their name</th><th className="pr-3 text-left font-normal">Bought as</th><th className="pr-3 text-right font-normal">Price</th><th className="pr-3 text-left font-normal">Deal</th><th className="text-right font-normal">Cost after deal</th></tr></thead>
                    <tbody>{supLines.map(({ sp, deal, cost }, i) => (
                      <tr key={sp.id} className={cn("h-11 whitespace-nowrap border-b border-border/50", canEditList && "cursor-pointer hover:bg-muted/40")} onClick={() => canEditList && openSupplier(sp.id)}>
                        <td className="pr-3 font-medium">{sp.supplier || "—"}{cheapestAt === i && tag}</td><td className="pr-3 text-muted-foreground">{sp.external_sku || "—"}</td>
                        <td className="pr-3 text-muted-foreground"><span className="block truncate" style={{ maxWidth: "var(--bani-name-max)" }}>{sp.supplier_product_name || "—"}</span></td>
                        <td className="pr-3">{boughtAs(sp.purchase_unit, sp.stock_qty, sp.stock_uom) || <span className="text-[hsl(var(--warning))]">No unit</span>}</td>
                        <td className="td-num pr-3 text-right">{sp.purchase_unit_cost > 0 ? fmt(sp.purchase_unit_cost) : <span className="text-[hsl(var(--warning))]">No price</span>}</td>
                        <td className="pr-3">{deal ? <span className="text-[#2F7A5E]">{dealLabel(deal, sp.purchase_unit_cost)}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="td-num text-right font-medium">{cost != null ? <>{fmt(cost)} <span className="font-normal text-muted-foreground">/ {sp.stock_uom}</span></> : <span className="text-muted-foreground">—</span>}</td>
                      </tr>))}</tbody></table></div>,
              <>
                      <div>
                        <Label className="text-xs">Supplier</Label>
                        <Select value={form.supplier} onValueChange={v => setForm({ ...form, supplier: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                          <SelectContent>
                            {dbSuppliers.filter(s => s.name && s.name.trim() !== "").map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Purchase &amp; Stock</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">Purchase UOM</Label><UomSelect type="purchase" value={form.purchase_unit} onChange={v => setForm({ ...form, purchase_unit: v })} placeholder="e.g. Case" /></div>
                          <div><Label className="text-xs">Purchase Cost ({baseSymbol()})</Label><Input type="number" inputMode="decimal" step="0.01" value={form.purchase_unit_cost} onChange={e => setForm({ ...form, purchase_unit_cost: e.target.value })} className="h-9 text-sm tabular-nums" /></div>
                          <div><Label className="text-xs">Stock UOM</Label><UomSelect type="stock" value={form.stock_uom} onChange={v => setForm({ ...form, stock_uom: v })} placeholder="e.g. Bottle" /></div>
                          <div><Label className="text-xs">Stock Qty</Label><Input type="number" inputMode="decimal" step="0.01" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} className="h-9 text-sm tabular-nums" /></div>
                        </div>
                        <div className="mt-2 bg-muted/30 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">
                            Cost per Stock Unit: <span className="tabular-nums font-semibold text-foreground">{baseSymbol()}{fmt(liveCostPerStock)}</span>
                            <span className="ml-2 text-muted-foreground/70">(Purchase Cost ÷ Stock Qty)</span>
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recipe Units</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">Recipe UOM</Label><UomSelect type="base" value={form.base_unit_type} onChange={v => setForm({ ...form, base_unit_type: v })} placeholder="e.g. g, ml" /></div>
                          <div><Label className="text-xs">Recipe Qty</Label><Input type="number" inputMode="decimal" step="0.01" value={form.base_unit_qty} onChange={e => setForm({ ...form, base_unit_qty: e.target.value })} placeholder="1000 for 1kg" className="h-9 text-sm tabular-nums" /></div>
                        </div>
                        <div className="mt-2 bg-muted/30 rounded-lg p-2">
                          {(() => {
                            const py = parseFloat(form.purchase_yield) || 100;
                            const cy = parseFloat(form.cooking_yield) || 100;
                            const totalYield = (py / 100) * (cy / 100);
                            const purchaseCost = parseFloat(form.purchase_unit_cost) || 0;
                            const baseQty = parseFloat(form.base_unit_qty) || 1;
                            const rawCostPerBase = baseQty > 0 ? purchaseCost / baseQty : 0;
                            const effectiveCostPerBase = totalYield > 0 ? rawCostPerBase / totalYield : rawCostPerBase;
                            const hasYield = totalYield < 0.9999;
                            return hasYield ? (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Raw cost per {form.base_unit_type || "unit"}: <span className="tabular-nums line-through text-muted-foreground/60">{baseSymbol()}{rawCostPerBase.toFixed(4)}</span></p>
                                <p className="text-xs text-muted-foreground">Effective cost per {form.base_unit_type || "unit"} (after {(totalYield * 100).toFixed(1)}% yield): <strong className="text-foreground tabular-nums">{baseSymbol()}{effectiveCostPerBase.toFixed(4)}</strong> ← used in recipes</p>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Standard Cost per Recipe Unit: <strong className="tabular-nums">{baseSymbol()}{rawCostPerBase.toFixed(4)}</strong> (Purchase Cost ÷ Recipe Qty)</p>
                            );
                          })()}
                        </div>
                      </div>
                    </>,
              <span />)}
            {isNew && card("supplier", "Supplier", null, <>
                      <div>
                        <Label className="text-xs">Supplier</Label>
                        <Select value={form.supplier} onValueChange={v => setForm({ ...form, supplier: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                          <SelectContent>
                            {dbSuppliers.filter(s => s.name && s.name.trim() !== "").map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Purchase &amp; Stock</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">Purchase UOM</Label><UomSelect type="purchase" value={form.purchase_unit} onChange={v => setForm({ ...form, purchase_unit: v })} placeholder="e.g. Case" /></div>
                          <div><Label className="text-xs">Purchase Cost ({baseSymbol()})</Label><Input type="number" inputMode="decimal" step="0.01" value={form.purchase_unit_cost} onChange={e => setForm({ ...form, purchase_unit_cost: e.target.value })} className="h-9 text-sm tabular-nums" /></div>
                          <div><Label className="text-xs">Stock UOM</Label><UomSelect type="stock" value={form.stock_uom} onChange={v => setForm({ ...form, stock_uom: v })} placeholder="e.g. Bottle" /></div>
                          <div><Label className="text-xs">Stock Qty</Label><Input type="number" inputMode="decimal" step="0.01" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} className="h-9 text-sm tabular-nums" /></div>
                        </div>
                        <div className="mt-2 bg-muted/30 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">
                            Cost per Stock Unit: <span className="tabular-nums font-semibold text-foreground">{baseSymbol()}{fmt(liveCostPerStock)}</span>
                            <span className="ml-2 text-muted-foreground/70">(Purchase Cost ÷ Stock Qty)</span>
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recipe Units</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">Recipe UOM</Label><UomSelect type="base" value={form.base_unit_type} onChange={v => setForm({ ...form, base_unit_type: v })} placeholder="e.g. g, ml" /></div>
                          <div><Label className="text-xs">Recipe Qty</Label><Input type="number" inputMode="decimal" step="0.01" value={form.base_unit_qty} onChange={e => setForm({ ...form, base_unit_qty: e.target.value })} placeholder="1000 for 1kg" className="h-9 text-sm tabular-nums" /></div>
                        </div>
                        <div className="mt-2 bg-muted/30 rounded-lg p-2">
                          {(() => {
                            const py = parseFloat(form.purchase_yield) || 100;
                            const cy = parseFloat(form.cooking_yield) || 100;
                            const totalYield = (py / 100) * (cy / 100);
                            const purchaseCost = parseFloat(form.purchase_unit_cost) || 0;
                            const baseQty = parseFloat(form.base_unit_qty) || 1;
                            const rawCostPerBase = baseQty > 0 ? purchaseCost / baseQty : 0;
                            const effectiveCostPerBase = totalYield > 0 ? rawCostPerBase / totalYield : rawCostPerBase;
                            const hasYield = totalYield < 0.9999;
                            return hasYield ? (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Raw cost per {form.base_unit_type || "unit"}: <span className="tabular-nums line-through text-muted-foreground/60">{baseSymbol()}{rawCostPerBase.toFixed(4)}</span></p>
                                <p className="text-xs text-muted-foreground">Effective cost per {form.base_unit_type || "unit"} (after {(totalYield * 100).toFixed(1)}% yield): <strong className="text-foreground tabular-nums">{baseSymbol()}{effectiveCostPerBase.toFixed(4)}</strong> ← used in recipes</p>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Standard Cost per Recipe Unit: <strong className="tabular-nums">{baseSymbol()}{rawCostPerBase.toFixed(4)}</strong> (Purchase Cost ÷ Recipe Qty)</p>
                            );
                          })()}
                        </div>
                      </div>
                    </>)}

            {card("stock", "Stock & recipes",
              grid(<>{kv("Counts as stock", form.creates_stock_movement ? "Yes" : "No")}{form.creates_stock_movement && kv("Stock unit", form.stock_uom)}{form.creates_stock_movement && kv("Recipe unit", form.base_unit_type ? `${form.base_unit_qty} ${form.base_unit_type} per ${form.purchase_unit || "unit"}` : "")}
                {form.creates_stock_movement && kv("Yields", `${form.purchase_yield || 100}% · ${form.cooking_yield || 100}%`)}{form.creates_stock_movement && kv("Reorder", form.reorder_qty ? `${form.reorder_qty} (min ${form.min_stock_qty || 0})` : "", "Not set")}</>),
              <>
                      <p className="text-xs text-muted-foreground">Account for prep loss and cooking shrinkage. Leave at 100% if there is no waste.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Purchase yield %</Label>
                          <div className="relative">
                            <Input type="number" inputMode="decimal" min={1} max={100} step={0.1} value={form.purchase_yield}
                              onChange={e => setForm(f => ({ ...f, purchase_yield: e.target.value }))} className="pr-8 text-sm h-9 tabular-nums" />
                            <span className="absolute right-3 top-2 text-xs text-muted-foreground">%</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Trim, peeling, bone, fat removed</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Cooking yield %</Label>
                          <div className="relative">
                            <Input type="number" inputMode="decimal" min={1} max={100} step={0.1} value={form.cooking_yield}
                              onChange={e => setForm(f => ({ ...f, cooking_yield: e.target.value }))} className="pr-8 text-sm h-9 tabular-nums" />
                            <span className="absolute right-3 top-2 text-xs text-muted-foreground">%</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Moisture &amp; shrinkage lost during cooking</p>
                        </div>
                      </div>
                      {(() => {
                        const py = parseFloat(form.purchase_yield) || 100;
                        const cy = parseFloat(form.cooking_yield) || 100;
                        const totalYield = (py / 100) * (cy / 100) * 100;
                        return (
                          <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">Total yield:</span>
                            <span className={cn("tabular-nums font-medium", totalYield < 80 ? "text-warning" : "text-foreground")}>{totalYield.toFixed(1)}%</span>
                          </div>
                        );
                      })()}
                    
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label className="text-xs">Min stock qty</Label><Input type="number" inputMode="decimal" step="0.01" value={form.min_stock_qty} onChange={e => setForm({ ...form, min_stock_qty: e.target.value })} className="h-9 text-sm tabular-nums" /></div>
                        <div><Label className="text-xs">Reorder qty</Label><Input type="number" inputMode="decimal" step="0.01" value={form.reorder_qty} onChange={e => setForm({ ...form, reorder_qty: e.target.value })} className="h-9 text-sm tabular-nums" /></div>
                      </div>
                    </>)}

            {card("books", "Books",
              grid(<>{kv("Group", form.financial_treatment, "No group")}{kv("Account", acct ? `${acct.code} ${acct.name}` : fromSetup ? "From Purchasing setup" : "", "No account")}{kv("Set", acct ? "On this item" : "By category", "")}</>),
              <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Financial Treatment</Label>
                      <Select
                        value={form.financial_treatment || "__none__"}
                        onValueChange={v => {
                          const treatment = v === "__none__" ? "" : v;
                          const autoStock = treatment === "COGS";
                          setForm({ ...form, financial_treatment: treatment, default_coa_account_id: "", creates_stock_movement: autoStock });
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select treatment" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          <SelectItem value="COGS">COGS</SelectItem>
                          <SelectItem value="OpEx">OpEx</SelectItem>
                          <SelectItem value="Asset - Supplier Deposit">Asset – Supplier & Vendor Deposit</SelectItem>
                          <SelectItem value="Asset - Fixed Asset">Asset – Fixed Asset</SelectItem>
                          <SelectItem value="Asset - Prepayment">Asset – Prepayment</SelectItem>
                          <SelectItem value="Asset - Other">Asset – Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground mt-1">Drives default COA account via L1 mapping.</p>
                    </div>
                    <div>
                      <Label className="text-xs">COA Account Override</Label>
                      <Select
                        value={form.default_coa_account_id || "__inherit__"}
                        onValueChange={v => setForm({ ...form, default_coa_account_id: v === "__inherit__" ? "" : v })}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Inherit from mapping" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__inherit__">— Inherit from mapping —</SelectItem>
                          {coaAccounts
                            .filter(a => a.is_active)
                            .filter(a => {
                              const t = form.financial_treatment;
                              if (!t) return true;
                              if (t === "COGS") return a.account_type === "cogs";
                              if (t === "OpEx") return a.account_type === "opex";
                              if (t.startsWith("Asset")) return a.account_type === "asset";
                              return true;
                            })
                            .map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-xs">
                                <span className="font-mono text-muted-foreground mr-2">{a.code}</span>{a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs font-medium">Creates stock movement</Label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        When off, receiving this item will not update inventory. Use for refunds, deposits and non-stock expenses.
                      </p>
                    </div>
                    <Switch checked={form.creates_stock_movement}
                      onCheckedChange={(v) => setForm(f => ({ ...f, creates_stock_movement: v }))} />
                  </div>
                </>)}

            {!isNew && form.creates_stock_movement && <section className="rounded-2xl border border-border bg-card p-5" aria-label="Deals"><h3 className="mb-3 text-[15px] font-semibold">Deals</h3>
                      {editingProductId && (
                        <Button size="sm" variant="outline" onClick={() => { setEditingDeal(null); setDealDialogOpen(true); }}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add deal
                        </Button>
                      )}
                      {!editingProductId ? (
                        <p className="text-xs text-muted-foreground">Save the item first to add supplier deals.</p>
                      ) : deals.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No deals configured</p>
                      ) : (
                        <div className="space-y-2">
                          {deals.map((d) => {
                            const supplier = dbSuppliers.find((s) => s.id === d.supplier_id);
                            // Price and pack of the deal's own supplier (not the supplier this page was opened from).
                            const entry = products.find(p => p.id === editingProductId)?.suppliers?.find(x => x.supplier === supplier?.name);
                            const pc = entry ? Number(entry.purchase_unit_cost) || 0 : parseFloat(form.purchase_unit_cost) || 0;
                            const unit = entry?.purchase_unit || form.purchase_unit || "unit";
                            const perStock = entry ? costAfterDeal({ purchase_unit: entry.purchase_unit, purchase_unit_cost: pc, stock_qty: entry.stock_qty, stock_uom: entry.stock_uom }, d as any) : null;
                            const effective = perStock ?? (d.buy_qty + d.free_qty > 0 ? (d.buy_qty * pc) / (d.buy_qty + d.free_qty) : 0);
                            const effUnit = perStock != null ? entry!.stock_uom : unit;
                            const expired = !!d.valid_until && d.valid_until < today;
                            const notYet = !!d.valid_from && d.valid_from > today;
                            const fmtDay = (v: string | null) => {
                              if (!v) return "—";
                              const dt = new Date(`${v}T00:00:00`);
                              return Number.isNaN(dt.getTime())
                                ? v
                                : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
                            };
                            return (
                              <div key={d.id} className={`flex items-center gap-3 border rounded-md px-3 py-2 text-xs ${expired ? "opacity-60" : ""}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-medium truncate">{supplier?.name || "—"}</span>
                                    {expired && <span className="chip chip-neutral shrink-0">Expired</span>}
                                    {notYet && <span className="chip chip-info shrink-0">Scheduled</span>}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {(d as any).deal_type === "discount" ? dealLabel(d as any, pc) : <>Buy <span className="tabular-nums">{d.buy_qty}</span> {unit} get <span className="tabular-nums">{d.free_qty}</span> {unit} free</>}
                                  </div>
                                  {(d.valid_from || d.valid_until) && (
                                    <div className="text-muted-foreground">
                                      Valid: {fmtDay(d.valid_from)} – {fmtDay(d.valid_until)}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <div className="text-muted-foreground">Effective</div>
                                  <div className="tabular-nums font-semibold">{formatCurrency(effective)} / {effUnit}</div>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8"
                                    onClick={() => {
                                      setEditingDeal({ id: d.id, supplier_id: d.supplier_id, buy_qty: d.buy_qty, free_qty: d.free_qty, deal_type: (d as any).deal_type, discount_percent: (d as any).discount_percent, special_price: (d as any).special_price, notes: d.notes, is_active: d.is_active, valid_from: d.valid_from, valid_until: d.valid_until });
                                      setDealDialogOpen(true);
                                    }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteDeal(d.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>}

            {isNew
              ? <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={attemptSave} disabled={!form.internal_sku.trim() || !form.internal_product_name.trim()}>Create</Button></div>
              : canEditList && editingRow && <button type="button" className="text-[13px] text-destructive" onClick={() => { setDeletingRow(editingRow); setDeleteOpen(true); }}>{(prod?.suppliers?.length ?? 0) > 1 ? `Remove ${form.supplier || "this supplier"} from this item` : "Delete item"}</button>}
          </div>
        );
      })()}



      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Entry"
        description={
          deletingRow?.supplier_entry && (deletingRow.product.suppliers?.length || 0) > 1
            ? "This will remove this supplier's pricing for this product. The product itself will remain."
            : "This will permanently remove this product and all its supplier entries from the master list."
        }
      />

      <AlertDialog open={confirmDuplicateOpen} onOpenChange={setConfirmDuplicateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate SKU Detected</AlertDialogTitle>
            <AlertDialogDescription>
              A product with SKU "{form.internal_sku}" ("{duplicateSku}") already exists.{" "}
              {editingProductId
                ? "This will merge this supplier entry into the existing product. Continue?"
                : "This will add a new supplier entry to the existing product — useful when the same supplier sells different weights or pack sizes under the same internal SKU. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Yes, Add Supplier Entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingProductId && (
        <SupplierDealDialog
          open={dealDialogOpen}
          onOpenChange={setDealDialogOpen}
          productId={editingProductId}
          purchaseUnitCost={parseFloat(form.purchase_unit_cost) || 0}
          purchaseUnit={form.purchase_unit}
          stockUom={form.stock_uom}
          suppliers={dbSuppliers}
          lockedSupplierId={dbSuppliers.find((s) => s.name === form.supplier)?.id || null}
          existingDeals={deals.map((d) => ({ id: d.id, supplier_id: d.supplier_id, deal_type: (d as any).deal_type ?? "buy_x_get_y_free" }))}
          initial={editingDeal}
          onSaved={() => { loadDeals(editingProductId); void loadAllDeals(); }}
        />
      )}
    </div>
  );
}
