import { useMemo, useState } from "react";
import {
  useChartOfAccounts, ChartAccount, AccountType, NormalSide,
  ACCOUNT_TYPE_LABEL, defaultNormalSide, CashFlowCategory,
} from "@/hooks/useChartOfAccounts";
import { useJournal } from "@/hooks/useJournal";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useTrialBalance } from "@/hooks/useTrialBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomSheetDialog } from "@/components/kpi/BottomSheetDialog";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, RefreshCw, Loader2, Search, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { RevenueMappingMatrix } from "@/components/finance/RevenueMappingMatrix";
import { ProcurementMappingMatrix } from "@/components/finance/ProcurementMappingMatrix";
import { PayrollMappingMatrix } from "@/components/finance/PayrollMappingMatrix";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PageHeader, KpiCard, KpiGrid, fmtHKWhole } from "@/components/expenses/shared";

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];
type ActiveFilter = "active" | "inactive" | "all";

/* ------------------------------------------------------------------
 * INTERIM group derivation (code-range based).
 *
 * The DB `account_type` column only distinguishes asset / liability /
 * equity / revenue / cogs / opex / other_expense — every operating cost
 * lands in one giant "opex" bucket. The UI wants a finer split
 * (staff / occupancy / opex / etc.) that matches the target chart
 * restructure. Until we run the COA-restructure migration that adds a
 * real `account_group` / subtype column, we derive the display group
 * from the account CODE. Swap this single function for a lookup on the
 * new column once the migration lands.
 * ------------------------------------------------------------------ */
type GroupKey =
  | "assets" | "liabilities" | "equity" | "revenue"
  | "cost_of_sales" | "staff" | "opex" | "occupancy"
  | "other" | "taxes";

interface GroupDef {
  key: GroupKey;
  label: string;
  color: string;           // 3px left-bar accent (semantic-ish, but data-driven per spec)
  primeCost?: boolean;
}

const GROUPS: GroupDef[] = [
  { key: "assets",         label: "Assets",                     color: "#378ADD" },
  { key: "liabilities",    label: "Liabilities",                color: "#D4537E" },
  { key: "equity",         label: "Equity",                     color: "#7F77DD" },
  { key: "revenue",        label: "Revenue",                    color: "#1D9E75" },
  { key: "cost_of_sales",  label: "Cost of sales",              color: "#D85A30", primeCost: true },
  { key: "staff",          label: "Staff costs",                color: "#BA7517", primeCost: true },
  { key: "opex",           label: "Operating expenses",         color: "#EF9F27" },
  { key: "occupancy",      label: "Occupancy",                  color: "#993C1D" },
  { key: "other",          label: "Other income & expenses",    color: "#888780" },
  { key: "taxes",          label: "Taxes & below-the-line",     color: "#5F5E5A" },
];

const GROUP_INDEX: Record<GroupKey, GroupDef> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g])
) as Record<GroupKey, GroupDef>;

/** Code → group. Interim heuristic — replace with a real subtype column. */
function groupForAccount(a: Pick<ChartAccount, "code" | "name" | "account_type">): GroupKey {
  const code = (a.code ?? "").trim();
  const first = code.charAt(0);
  if (first === "1") return "assets";
  if (first === "2") return "liabilities";
  if (first === "3") return "equity";
  if (first === "4") return "revenue";
  if (first === "5") return "cost_of_sales";
  if (first === "8") return "other";
  if (first === "9") return "taxes";
  if (first === "6") {
    // Occupancy: rent + building management (currently 6150 / 6160).
    if (code === "6150" || code === "6160") return "occupancy";
    // Staff costs: name-based heuristic until the subtype column exists.
    const n = (a.name ?? "").toLowerCase();
    if (/(salary|salaries|wage|wages|payroll|staff|labor|labour|mpf|bonus|gratuity|severance)/.test(n)) {
      return "staff";
    }
    return "opex";
  }
  // Fallback: use the coarse account_type.
  switch (a.account_type) {
    case "asset":         return "assets";
    case "liability":     return "liabilities";
    case "equity":        return "equity";
    case "revenue":       return "revenue";
    case "cogs":          return "cost_of_sales";
    case "other_income":
    case "other_expense": return "other";
    default:              return "opex";
  }
}

const INITIAL_ROWS_PER_GROUP = 6;

export default function ChartOfAccountsPage() {
  const { items, loading, createAccount, updateAccount, deleteAccount, countJournalLines } = useChartOfAccounts();
  const { rebuildFromOperations } = useJournal();
  const { tenantId, memberships } = useActiveTenant();
  const { rows: tbRows, loading: tbLoading } = useTrialBalance();
  const isMobile = useIsMobile();
  const [rebuilding, setRebuilding] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [draft, setDraft] = useState<Partial<ChartAccount>>({ account_type: "asset", normal_side: "debit" });

  // Filters
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupKey | "all">("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<GroupKey>>(() => new Set(GROUPS.map((g) => g.key)));
  const [expandedAll, setExpandedAll] = useState<Set<GroupKey>>(() => new Set());

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<{ journalLines: number; childCount: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const tenantName = memberships.find((m) => m.tenant_id === tenantId)?.tenant_name;

  // Balance lookup — signed by normal_side already.
  const balanceByAccount = useMemo(() => {
    const m = new Map<string, number>();
    tbRows.forEach((r) => m.set(r.account_id, Number(r.balance) || 0));
    return m;
  }, [tbRows]);

  const childCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((a) => { if (a.parent_id) m.set(a.parent_id, (m.get(a.parent_id) ?? 0) + 1); });
    return m;
  }, [items]);

  // Tag every account with its display group, then bucket.
  const accountsByGroup = useMemo(() => {
    const buckets = new Map<GroupKey, ChartAccount[]>();
    GROUPS.forEach((g) => buckets.set(g.key, []));
    items.forEach((a) => {
      const g = groupForAccount(a);
      buckets.get(g)!.push(a);
    });
    buckets.forEach((list) =>
      list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    );
    return buckets;
  }, [items]);

  // Search filter (over grouped buckets — kept here so pill counts follow search).
  const filteredByGroup = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = new Map<GroupKey, ChartAccount[]>();
    accountsByGroup.forEach((list, key) => {
      const filtered = q
        ? list.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(q))
        : list;
      out.set(key, filtered);
    });
    return out;
  }, [accountsByGroup, search]);

  const totalFiltered = useMemo(() => {
    let n = 0;
    filteredByGroup.forEach((l) => { n += l.length; });
    return n;
  }, [filteredByGroup]);

  // KPI numbers — derived from trial balance.
  const kpi = useMemo(() => {
    let revenue = 0;
    let cos = 0;
    let staff = 0;
    items.forEach((a) => {
      const g = groupForAccount(a);
      const bal = balanceByAccount.get(a.id) ?? 0;
      if (g === "revenue") revenue += bal;
      else if (g === "cost_of_sales") cos += bal;
      else if (g === "staff") staff += bal;
    });
    const rev = Math.abs(revenue);
    const primeCost = Math.abs(cos) + Math.abs(staff);
    const ratio = rev > 0 ? (primeCost / rev) * 100 : 0;
    return { revenue: rev, primeCost, ratio, accounts: items.length };
  }, [items, balanceByAccount]);

  const openNew = () => {
    setEditing(null);
    setDraft({ account_type: "asset", normal_side: "debit", is_active: true, sort_order: 0, cash_flow_category: null });
    setEditorOpen(true);
  };
  const openEdit = (a: ChartAccount) => { setEditing(a); setDraft({ ...a }); setEditorOpen(true); };

  const handleSave = async () => {
    if (editing) await updateAccount(editing.id, draft);
    else { const created = await createAccount(draft); if (!created) return; }
    setEditorOpen(false);
  };

  const doRebuild = async () => {
    setRebuilding(true);
    try { await rebuildFromOperations(); } finally { setRebuilding(false); }
  };

  const beginDelete = async (a: ChartAccount) => {
    setDeleteTarget(a); setDeleteUsage(null); setDeleteLoading(true);
    const [journalLines, childCount] = await Promise.all([
      countJournalLines(a.id),
      Promise.resolve(childCountByParent.get(a.id) ?? 0),
    ]);
    setDeleteUsage({ journalLines, childCount });
    setDeleteLoading(false);
  };
  const confirmDelete = async () => { if (!deleteTarget) return; await deleteAccount(deleteTarget.id); setDeleteTarget(null); setDeleteUsage(null); };
  const deactivateFromDelete = async () => { if (!deleteTarget) return; await updateAccount(deleteTarget.id, { is_active: false }); setDeleteTarget(null); setDeleteUsage(null); };

  const parentOptions = useMemo(() => {
    if (!draft.account_type) return [];
    const forbidden = new Set<string>();
    if (editing) {
      forbidden.add(editing.id);
      items.forEach((a) => { if (a.parent_id === editing.id) forbidden.add(a.id); });
    }
    return items
      .filter((a) => a.account_type === draft.account_type && !forbidden.has(a.id))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [items, draft.account_type, editing]);

  // Format balance with parentheses for negatives — never truncate.
  const fmtBal = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(HK$ ${abs})` : `HK$ ${abs}`;
  };

  const toggleGroup = (key: GroupKey) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleShowAll = (key: GroupKey) => {
    setExpandedAll((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const visibleGroups = GROUPS.filter((g) => groupFilter === "all" || g.key === groupFilter);

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <PageHeader
        title="Chart of accounts"
        description={
          <span className="tabular-nums">
            {items.length} accounts{tenantName ? <> · {tenantName}</> : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" disabled title="Import coming soon">
              <Upload className="h-4 w-4 mr-1" /> Import
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={rebuilding || !tenantId} className="text-muted-foreground">
                  {rebuilding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Rebuild ledger
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rebuild ledger from operations?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Regenerates all auto-derived journal entries for this tenant. Manually-edited entries are preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={doRebuild}>Rebuild now</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Add account
            </Button>
          </>
        }
      />

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="mapping">Account mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by account code or name…"
              className="h-10 pl-9"
            />
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2">
            <Pill
              active={groupFilter === "all"}
              onClick={() => setGroupFilter("all")}
              label="All"
              count={totalFiltered}
            />
            {GROUPS.map((g) => {
              const count = filteredByGroup.get(g.key)?.length ?? 0;
              return (
                <Pill
                  key={g.key}
                  active={groupFilter === g.key}
                  onClick={() => setGroupFilter(g.key)}
                  label={g.label}
                  count={count}
                  dotColor={g.color}
                />
              );
            })}
          </div>

          {/* KPI strip */}
          <KpiGrid>
            <KpiCard
              label="Prime cost ratio"
              value={<span>{kpi.ratio.toFixed(1)}%</span>}
              hint={`Cost of sales + Staff · ${fmtHKWhole(kpi.primeCost)}`}
              tone={kpi.ratio > 65 ? "warning" : "info"}
            />
            <KpiCard
              label="Revenue"
              value={<span>{fmtHKWhole(kpi.revenue)}</span>}
              hint="Posted, all periods"
              tone="success"
            />
            <KpiCard
              label="Accounts"
              value={<span className="tabular-nums">{items.length}</span>}
              hint={`${items.filter((a) => a.is_active).length} active`}
            />
          </KpiGrid>

          {/* Grouped list */}
          {loading || tbLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGroups.map((g) => {
                const list = filteredByGroup.get(g.key) ?? [];
                const isOpen = expandedGroups.has(g.key);
                const showAll = expandedAll.has(g.key);
                const shown = showAll ? list : list.slice(0, INITIAL_ROWS_PER_GROUP);
                const hidden = Math.max(0, list.length - shown.length);
                const groupTotal = list.reduce((s, a) => s + (balanceByAccount.get(a.id) ?? 0), 0);
                // Hide entirely when searching and group has zero matches; keep visible otherwise (empty state row).
                if (search.trim() && list.length === 0) return null;

                return (
                  <div
                    key={g.key}
                    className="rounded-xl border border-border/60 bg-card overflow-hidden"
                  >
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      className="w-full flex items-stretch text-left hover:bg-muted/40 transition-colors"
                    >
                      <span
                        aria-hidden
                        className="w-[3px] shrink-0"
                        style={{ backgroundColor: g.color }}
                      />
                      <div className="flex-1 flex items-center justify-between gap-3 px-4 py-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <span className="text-sm font-medium truncate">{g.label}</span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{list.length}</span>
                          {g.primeCost && (
                            <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide bg-primary/10 text-primary border border-primary/25 shrink-0">
                              Prime cost
                            </span>
                          )}
                        </div>
                        <span className="td-num tabular-nums text-sm font-medium whitespace-nowrap shrink-0">
                          {fmtBal(groupTotal)}
                        </span>
                      </div>
                    </button>

                    {/* Group body */}
                    {isOpen && (
                      <div className="border-t border-border/40">
                        {list.length === 0 ? (
                          <button
                            type="button"
                            onClick={openNew}
                            className="w-full text-left px-4 py-3 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
                          >
                            + Add first account
                          </button>
                        ) : (
                          <>
                            <ul className="divide-y divide-border/40">
                              {shown.map((a) => (
                                <AccountRow
                                  key={a.id}
                                  account={a}
                                  balance={balanceByAccount.get(a.id) ?? 0}
                                  fmtBal={fmtBal}
                                  onEdit={() => openEdit(a)}
                                  onDelete={() => beginDelete(a)}
                                />
                              ))}
                            </ul>
                            {hidden > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleShowAll(g.key)}
                                className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/40 border-t border-border/40 transition-colors"
                              >
                                {showAll ? "Show fewer" : `Show ${hidden} more`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <Tabs defaultValue="sales-revenue">
            <TabsList>
              <TabsTrigger value="sales-revenue">Sales Revenue</TabsTrigger>
              <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
              <TabsTrigger value="procurement">Procurement</TabsTrigger>
              <TabsTrigger value="payroll">Payroll</TabsTrigger>
            </TabsList>
            <TabsContent value="sales-revenue" className="mt-4">
              <RevenueMappingMatrix accounts={items} section="sales" />
            </TabsContent>
            <TabsContent value="payment-methods" className="mt-4">
              <RevenueMappingMatrix accounts={items} section="payments" />
            </TabsContent>
            <TabsContent value="procurement" className="mt-4">
              <ProcurementMappingMatrix accounts={items} />
            </TabsContent>
            <TabsContent value="payroll" className="mt-4">
              <PayrollMappingMatrix accounts={items} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Editor */}
      <BottomSheetDialog open={editorOpen} onOpenChange={setEditorOpen} className={isMobile ? undefined : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Identity</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Code</label>
                <Input value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="h-10 font-mono tabular-nums" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Name</label>
                <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10" />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground">Description</label>
              <Textarea
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="When to use this account…"
                rows={2}
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Classification</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Type</label>
                <Select value={draft.account_type} onValueChange={(v) => setDraft({ ...draft, account_type: v as AccountType, normal_side: defaultNormalSide(v as AccountType), parent_id: null })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Normal side</label>
                <Select value={draft.normal_side} onValueChange={(v) => setDraft({ ...draft, normal_side: v as NormalSide })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground">Parent account</label>
              <Select
                value={draft.parent_id ?? "__none"}
                onValueChange={(v) => setDraft({ ...draft, parent_id: v === "__none" ? null : v })}
              >
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None (top level)</SelectItem>
                  {parentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs mr-2">{a.code}</span>{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground">Cash Flow Category</label>
              <Select
                value={draft.cash_flow_category ?? "__none"}
                onValueChange={(v) => setDraft({ ...draft, cash_flow_category: v === "__none" ? null : (v as CashFlowCategory) })}
              >
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  <SelectItem value="operating">Operating</SelectItem>
                  <SelectItem value="investing">Investing</SelectItem>
                  <SelectItem value="financing">Financing</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/80 mt-1">Used by the Cashflow Statement.</p>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Flags & Ordering</div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <Switch checked={!!draft.is_cash} onCheckedChange={(v) => setDraft({ ...draft, is_cash: v })} /> Cash account
              </label>
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} /> Active
              </label>
            </div>
            <div className="mt-2 max-w-[140px]">
              <label className="text-[11px] text-muted-foreground">Sort order</label>
              <Input
                type="number"
                inputMode="numeric"
                value={draft.sort_order ?? 0}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
                className="h-10 tabular-nums"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!draft.code || !draft.name}>{editing ? "Save changes" : "Add account"}</Button>
        </DialogFooter>
      </BottomSheetDialog>

      {/* Delete confirm / blocked dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteUsage(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete account{deleteTarget ? <> <span className="font-mono">{deleteTarget.code}</span> · {deleteTarget.name}</> : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleteLoading || !deleteUsage ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking usage…</div>
                ) : deleteUsage.childCount > 0 ? (
                  <p>This account has <span className="tabular-nums">{deleteUsage.childCount}</span> child account{deleteUsage.childCount === 1 ? "" : "s"}. Reassign or delete them first.</p>
                ) : deleteUsage.journalLines > 0 ? (
                  <p>This account has <span className="tabular-nums">{deleteUsage.journalLines}</span> journal line{deleteUsage.journalLines === 1 ? "" : "s"} posted to it. Deactivate it instead.</p>
                ) : (
                  <p>This cannot be undone.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteUsage && deleteUsage.childCount === 0 && deleteUsage.journalLines > 0 && deleteTarget?.is_active && (
              <AlertDialogAction onClick={deactivateFromDelete}>Deactivate</AlertDialogAction>
            )}
            {deleteUsage && deleteUsage.childCount === 0 && deleteUsage.journalLines === 0 && (
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- sub-components ---------------- */

function Pill({
  active, onClick, label, count, dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors border",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted",
      )}
    >
      {dotColor && (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "tabular-nums rounded-full px-1.5 py-0.5 text-[10px]",
          active ? "bg-background/20 text-background" : "bg-background/60 text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AccountRow({
  account, balance, fmtBal, onEdit, onDelete,
}: {
  account: ChartAccount;
  balance: number;
  fmtBal: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "group px-4 py-2.5 hover:bg-muted/40 transition-colors",
        !account.is_active && "opacity-60",
      )}
    >
      {/* Desktop layout */}
      <div className="hidden md:flex items-center gap-3 min-w-0">
        <span className="font-mono text-xs tabular-nums text-muted-foreground w-10 shrink-0">
          {account.code}
        </span>
        <span className="text-sm text-foreground truncate flex-1 min-w-0" title={account.name}>
          {account.name}
        </span>
        {!account.is_active && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Inactive</span>
        )}
        <span className="td-num tabular-nums text-sm text-muted-foreground whitespace-nowrap shrink-0">
          {fmtBal(balance)}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted inline-flex items-center justify-center"
            onClick={onEdit} title="Edit" aria-label="Edit account"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted inline-flex items-center justify-center"
            onClick={onDelete} title="Delete" aria-label="Delete account"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile: two-line cell */}
      <div className="md:hidden flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
            {account.code}
          </span>
          <span className="text-sm text-foreground truncate flex-1 min-w-0">{account.name}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
              onClick={onEdit} aria-label="Edit account"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
              onClick={onDelete} aria-label="Delete account"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="td-num tabular-nums text-sm text-muted-foreground whitespace-nowrap">
            {fmtBal(balance)}
          </span>
        </div>
      </div>
    </li>
  );
}
