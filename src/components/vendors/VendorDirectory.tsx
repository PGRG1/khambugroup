import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Filter,
  MoreVertical,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type SortDir = "asc" | "desc";

type VendorType = "expense" | "procurement" | "both";
type TypeFilter = "all" | VendorType;
type StatusFilter = "active" | "inactive";

interface Vendor {
  id: string;
  code: string | null;
  name: string;
  vendor_type: VendorType | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  payment_terms: string | null;
  account_number: string | null;
  is_active: boolean;
}

const PAYMENT_TERMS = ["COD", "Net 7", "Net 14", "Net 30", "Net 60", "Due on presentation"];

const emptyForm = {
  name: "",
  code: "",
  vendor_type: "expense" as VendorType,
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  payment_terms: "COD",
  account_number: "",
  notes: "",
  is_active: true,
};

function generateCodeSuggestion(name: string, existingCodes: string[]): string {
  const base = name
    .replace(/[^a-zA-Z\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  if (!base) return "";
  const existing = existingCodes
    .filter((c) => c.startsWith(base + "-"))
    .map((c) => parseInt(c.split("-")[1] || "0", 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${base}-${String(next).padStart(3, "0")}`;
}

function TypeChip({ type }: { type: VendorType | null }) {
  const t = type || "procurement";
  const cls =
    t === "expense"
      ? "bg-accent/15 text-accent-foreground border-accent/25"
      : t === "both"
      ? "bg-primary/12 text-primary border-primary/25"
      : "bg-muted text-muted-foreground border-border";
  const label = t === "expense" ? "Expense" : t === "both" ? "Both" : "Procurement";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium tracking-wide",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        active
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-emerald-400" : "bg-muted-foreground/50",
        )}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Pill({
  label,
  count,
  active,
  onClick,
  tone = "neutral",
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: "neutral" | "success";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 h-8 text-xs font-medium transition-colors",
        active
          ? tone === "success"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30",
      )}
    >
      <span>{label}</span>
      <span className="text-[10.5px] tabular-nums opacity-70">·</span>
      <span className="tabular-nums text-[11px]">{count}</span>
    </button>
  );
}

interface Props {
  title?: string;
  defaultTypeFilter?: TypeFilter;
}

export default function VendorDirectory({
  title = "Suppliers & Vendors",
  defaultTypeFilter = "all",
}: Props) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const isMobile = useIsMobile();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(defaultTypeFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [termsFilter, setTermsFilter] = useState<string[]>([]); // empty = all


  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [v, b, i] = await Promise.all([
      supabase.from("suppliers").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("expense_bills").select("supplier_id").eq("tenant_id", tenantId),
      supabase.from("invoices").select("supplier_id").eq("tenant_id", tenantId),
    ]);
    if (v.error) toast.error("Failed to load vendors");
    setVendors(((v.data as unknown) as Vendor[]) || []);
    const counts: Record<string, number> = {};
    for (const r of ((b.data as any[]) || [])) {
      if (r.supplier_id) counts[r.supplier_id] = (counts[r.supplier_id] || 0) + 1;
    }
    for (const r of ((i.data as any[]) || [])) {
      if (r.supplier_id) counts[r.supplier_id] = (counts[r.supplier_id] || 0) + 1;
    }
    setUsage(counts);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantLoading]);

  // Auto-suggest code from name on new record
  useEffect(() => {
    if (editingId) return;
    if (codeManuallyEdited) return;
    if (!form.name.trim()) return;
    const existingCodes = vendors.map((v) => v.code || "").filter(Boolean);
    const suggested = generateCodeSuggestion(form.name, existingCodes);
    if (suggested) setForm((f) => ({ ...f, code: suggested }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, editingId, codeManuallyEdited]);

  const counts = useMemo(() => {
    const byType = { all: 0, expense: 0, procurement: 0, both: 0 } as Record<TypeFilter | "both", number>;
    const byStatus = { active: 0, inactive: 0 };
    for (const v of vendors) {
      byType.all++;
      const t = (v.vendor_type || "procurement") as VendorType;
      byType[t]++;
      if (v.is_active) byStatus.active++;
      else byStatus.inactive++;
    }
    return { byType, byStatus };
  }, [vendors]);

  const distinctTerms = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) {
      const t = (v.payment_terms || "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = vendors.filter((v) => {
      const t = (v.vendor_type || "procurement") as VendorType;
      if (typeFilter !== "all" && t !== typeFilter) return false;
      if (statusFilter === "active" && !v.is_active) return false;
      if (statusFilter === "inactive" && v.is_active) return false;
      if (termsFilter.length > 0 && !termsFilter.includes((v.payment_terms || "").trim())) return false;
      if (q) {
        const hay = `${v.name} ${v.code || ""} ${v.contact_person || ""} ${v.email || ""} ${v.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [vendors, search, typeFilter, statusFilter, termsFilter, sortDir]);


  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, vendor_type: defaultTypeFilter === "all" ? "expense" : (defaultTypeFilter as VendorType) });
    setCodeManuallyEdited(false);
    setSheetOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      code: v.code || "",
      vendor_type: (v.vendor_type || "procurement") as VendorType,
      contact_person: v.contact_person || "",
      phone: v.phone || "",
      email: v.email || "",
      address: v.address || "",
      payment_terms: v.payment_terms || "COD",
      account_number: v.account_number || "",
      notes: v.notes || "",
      is_active: v.is_active,
    });
    setCodeManuallyEdited(true);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const trimmedCode = form.code.trim();
    if (trimmedCode) {
      const dup = vendors.find((v) => (v.code || "") === trimmedCode && v.id !== editingId);
      if (dup) {
        toast.error(`Code "${trimmedCode}" is already used by ${dup.name}`);
        return;
      }
    }
    setSaving(true);
    const basePayload: any = {
      name: form.name.trim(),
      code: trimmedCode || null,
      vendor_type: form.vendor_type,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      payment_terms: form.payment_terms || null,
      account_number: form.account_number || "",
      notes: form.notes || null,
      is_active: form.is_active,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase
        .from("suppliers")
        .update(basePayload)
        .eq("id", editingId)
        .eq("tenant_id", tenantId!));
    } else {
      // Preserve defaults for dead-but-required columns.
      const insertPayload = {
        ...basePayload,
        tenant_id: tenantId,
        invoice_rounding_mode: "sum_then_round",
        categories: [] as string[],
        delivery_days: [] as string[],
        moq: 0,
      };
      ({ error } = await supabase.from("suppliers").insert(insertPayload as any));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? "Vendor updated" : "Vendor added");
    setSheetOpen(false);
    load();
  };

  const toggleActive = async (v: Vendor) => {
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: !v.is_active })
      .eq("id", v.id)
      .eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else {
      toast.success(v.is_active ? "Deactivated" : "Activated");
      load();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", deleteId)
      .eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else {
      toast.success("Vendor deleted");
      load();
    }
    setDeleteId(null);
  };

  const contactOf = (v: Vendor) => v.phone || v.contact_person || v.email || null;

  const RowMenu = ({ v }: { v: Vendor }) => {
    const usedCount = usage[v.id] || 0;
    const deleteDisabled = usedCount > 0;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => openEdit(v)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleActive(v)}>
            {v.is_active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {deleteDisabled ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuItem disabled className="text-destructive/60">
                      Delete
                    </DropdownMenuItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Has bills or invoices — deactivate instead
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <DropdownMenuItem
              onSelect={() => setDeleteId(v.id)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("active");
  };

  const hasAnyFilter =
    search.trim() !== "" || typeFilter !== "all" || statusFilter !== "active";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Master list of every company you bill from or purchase through.
          </p>
        </div>
        <Button size="sm" className="h-9" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add vendor
        </Button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill
          label="All"
          count={counts.byType.all}
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        />
        <Pill
          label="Expense"
          count={counts.byType.expense}
          active={typeFilter === "expense"}
          onClick={() => setTypeFilter("expense")}
        />
        <Pill
          label="Procurement"
          count={counts.byType.procurement}
          active={typeFilter === "procurement"}
          onClick={() => setTypeFilter("procurement")}
        />

        <div className="relative w-full sm:w-64 sm:ml-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search name, code, contact…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1" />

        <Pill
          label="Active"
          count={counts.byStatus.active}
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
          tone="success"
        />
        <Pill
          label="Inactive"
          count={counts.byStatus.inactive}
          active={statusFilter === "inactive"}
          onClick={() => setStatusFilter("inactive")}
        />
      </div>

      {/* Table / cards */}
      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            {vendors.length === 0 ? (
              <div className="flex flex-col items-center gap-3">
                <Users className="h-8 w-8 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">No vendors yet</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Add your first vendor to start tracking bills and invoices.
                  </div>
                </div>
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add first vendor
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No vendors match.
                {hasAnyFilter && (
                  <>
                    {" "}
                    <button
                      onClick={clearFilters}
                      className="text-primary hover:underline"
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : isMobile ? (
          <div className="divide-y divide-border">
            {filtered.map((v) => (
              <div
                key={v.id}
                className="p-3 flex items-start gap-3"
                onClick={() => openEdit(v)}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm truncate">{v.name}</div>
                    <TypeChip type={v.vendor_type} />
                  </div>
                  {v.code && (
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {v.code}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{v.payment_terms || "—"}</span>
                    <span>·</span>
                    <StatusPill active={v.is_active} />
                  </div>
                </div>
                <RowMenu v={v} />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border">
                  <TableHead
                    className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  >
                    <span className="inline-flex items-center gap-1">
                      Vendor
                      {sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : sortDir === "desc" ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </span>
                  </TableHead>
                  <TableHead className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium w-[130px]">
                    Type
                  </TableHead>
                  <TableHead className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium">
                    Contact
                  </TableHead>
                  <TableHead className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium w-[160px]">
                    <span className="inline-flex items-center gap-1.5">
                      Terms
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted transition-colors",
                              termsFilter.length > 0 ? "text-primary" : "text-muted-foreground/70 hover:text-foreground",
                            )}
                            aria-label="Filter by terms"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-52 p-2">
                          <div className="flex items-center justify-between px-1.5 pb-2 mb-1 border-b">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              Payment terms
                            </span>
                            {termsFilter.length > 0 && (
                              <button
                                onClick={() => setTermsFilter([])}
                                className="text-[11px] text-primary hover:underline"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => setTermsFilter([])}
                            className={cn(
                              "flex items-center gap-2 w-full px-1.5 py-1.5 rounded text-xs hover:bg-muted/50 text-left",
                              termsFilter.length === 0 && "text-primary font-medium",
                            )}
                          >
                            All
                          </button>
                          {distinctTerms.length === 0 ? (
                            <div className="px-1.5 py-2 text-[11px] text-muted-foreground">
                              No terms in current data.
                            </div>
                          ) : (
                            distinctTerms.map((t) => {
                              const checked = termsFilter.includes(t);
                              return (
                                <label
                                  key={t}
                                  className="flex items-center gap-2 px-1.5 py-1.5 rounded text-xs hover:bg-muted/50 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      setTermsFilter((prev) =>
                                        v
                                          ? [...prev, t]
                                          : prev.filter((x) => x !== t),
                                      );
                                    }}
                                  />
                                  <span className="normal-case">{t}</span>
                                </label>
                              );
                            })
                          )}
                        </PopoverContent>
                      </Popover>
                    </span>
                  </TableHead>

                  <TableHead className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium w-[110px] text-right pr-6">
                    Status
                  </TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => {
                  const contact = contactOf(v);
                  return (
                    <TableRow
                      key={v.id}
                      onClick={() => openEdit(v)}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="py-3">
                        <div className="font-medium text-sm text-foreground">{v.name}</div>
                        {v.code ? (
                          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            {v.code}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-3">
                        <TypeChip type={v.vendor_type} />
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground truncate max-w-[240px]">
                        {contact || <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        {v.payment_terms || <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="py-3 text-right pr-6">
                        <StatusPill active={v.is_active} />
                      </TableCell>
                      <TableCell className="py-3 pr-2 text-right">
                        <RowMenu v={v} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Editor sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-[520px] p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>{editingId ? "Edit vendor" : "New vendor"}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Assembly Café Ltd"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Code</Label>
                <Input
                  className="font-mono text-xs"
                  value={form.code}
                  placeholder="Auto"
                  onChange={(e) => {
                    setCodeManuallyEdited(true);
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vendor type</Label>
                <div className="flex rounded-md border border-border p-0.5 bg-muted/30">
                  {(["expense", "procurement", "both"] as VendorType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, vendor_type: t }))}
                      className={cn(
                        "flex-1 text-[11px] font-medium py-1.5 rounded transition-colors capitalize",
                        form.vendor_type === t
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Contact person</Label>
                <Input
                  value={form.contact_person}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contact_person: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Payment terms</Label>
                <Select
                  value={form.payment_terms}
                  onValueChange={(v) => setForm((f) => ({ ...f, payment_terms: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account number</Label>
                <Input
                  className="font-mono text-xs"
                  value={form.account_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, account_number: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <div className="text-xs font-medium">Active</div>
                <div className="text-[11px] text-muted-foreground">
                  Inactive vendors are hidden from pickers.
                </div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-background">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete vendor"
        description="This vendor will be permanently removed. This cannot be undone."
      />
    </div>
  );
}
