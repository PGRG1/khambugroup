import { useMemo, useState } from "react";
import {
  useChartOfAccounts, ChartAccount, AccountType, NormalSide,
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_GROUP, CASH_FLOW_CATEGORY_LABEL,
  defaultNormalSide, CashFlowCategory,
} from "@/hooks/useChartOfAccounts";
import { useJournal } from "@/hooks/useJournal";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, RefreshCw, Loader2, Search } from "lucide-react";
import { RevenueMappingMatrix } from "@/components/finance/RevenueMappingMatrix";
import { ProcurementMappingMatrix } from "@/components/finance/ProcurementMappingMatrix";
import { PayrollMappingMatrix } from "@/components/finance/PayrollMappingMatrix";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];
type ActiveFilter = "active" | "inactive" | "all";

export default function ChartOfAccountsPage() {
  const { items, loading, createAccount, updateAccount, deleteAccount, countJournalLines } = useChartOfAccounts();
  const { rebuildFromOperations } = useJournal();
  const { tenantId } = useActiveTenant();
  const isMobile = useIsMobile();
  const [rebuilding, setRebuilding] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [draft, setDraft] = useState<Partial<ChartAccount>>({ account_type: "asset", normal_side: "debit" });

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "all">("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<{ journalLines: number; childCount: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const childCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((a) => { if (a.parent_id) m.set(a.parent_id, (m.get(a.parent_id) ?? 0) + 1); });
    return m;
  }, [items]);

  // Global counters (unfiltered)
  const totalCount = items.length;
  const totalActive = items.filter((a) => a.is_active).length;
  const totalInactive = totalCount - totalActive;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (activeFilter === "active" && !a.is_active) return false;
      if (activeFilter === "inactive" && a.is_active) return false;
      if (typeFilter !== "all" && a.account_type !== typeFilter) return false;
      if (q) {
        const hay = `${a.code} ${a.name} ${a.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, typeFilter, activeFilter]);

  // Group matching accounts, then render as tree (parents + children) preserving matches:
  // if a child matches but parent doesn't, promote parent to visible; if parent matches, show it alone.
  const groupedTree = useMemo(() => {
    const matchIds = new Set(filtered.map((a) => a.id));
    // Expand: include parents of matched children so hierarchy renders
    const expanded = new Set(matchIds);
    filtered.forEach((a) => { if (a.parent_id) expanded.add(a.parent_id); });
    const visible = items.filter((a) => expanded.has(a.id));

    const byType = new Map<AccountType, ChartAccount[]>();
    TYPE_ORDER.forEach((t) => byType.set(t, []));
    visible.forEach((a) => byType.get(a.account_type)?.push(a));

    // Build a per-type tree: top-level (no parent in visible set) → children
    const out: { type: AccountType; nodes: { account: ChartAccount; children: ChartAccount[] }[] }[] = [];
    TYPE_ORDER.forEach((t) => {
      const list = byType.get(t) ?? [];
      if (list.length === 0) return;
      const idsInGroup = new Set(list.map((a) => a.id));
      const roots = list.filter((a) => !a.parent_id || !idsInGroup.has(a.parent_id));
      const childrenOf = (parentId: string) =>
        list.filter((a) => a.parent_id === parentId)
          .sort((a, b) => (a.sort_order - b.sort_order) || a.code.localeCompare(b.code));
      const sortedRoots = roots.sort((a, b) => (a.sort_order - b.sort_order) || a.code.localeCompare(b.code));
      out.push({
        type: t,
        nodes: sortedRoots.map((r) => ({ account: r, children: childrenOf(r.id) })),
      });
    });
    return { groups: out, visibleCount: visible.length };
  }, [items, filtered]);

  const openNew = () => {
    setEditing(null);
    setDraft({ account_type: "asset", normal_side: "debit", is_active: true, sort_order: 0, cash_flow_category: null });
    setEditorOpen(true);
  };

  const openEdit = (a: ChartAccount) => {
    setEditing(a);
    setDraft({ ...a });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      await updateAccount(editing.id, draft);
    } else {
      const created = await createAccount(draft);
      if (!created) return;
    }
    setEditorOpen(false);
  };

  const doRebuild = async () => {
    setRebuilding(true);
    try { await rebuildFromOperations(); } finally { setRebuilding(false); }
  };

  const beginDelete = async (a: ChartAccount) => {
    setDeleteTarget(a);
    setDeleteUsage(null);
    setDeleteLoading(true);
    const [journalLines, childCount] = await Promise.all([
      countJournalLines(a.id),
      Promise.resolve(childCountByParent.get(a.id) ?? 0),
    ]);
    setDeleteUsage({ journalLines, childCount });
    setDeleteLoading(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteAccount(deleteTarget.id);
    setDeleteTarget(null);
    setDeleteUsage(null);
  };

  const deactivateFromDelete = async () => {
    if (!deleteTarget) return;
    await updateAccount(deleteTarget.id, { is_active: false });
    setDeleteTarget(null);
    setDeleteUsage(null);
  };

  // Parent-account options for the editor: same type, not self, not one of its descendants
  const parentOptions = useMemo(() => {
    if (!draft.account_type) return [];
    const forbidden = new Set<string>();
    if (editing) {
      forbidden.add(editing.id);
      // Exclude direct children (prevents 1-level cycles); simple guard, sufficient for 1-level UI
      items.forEach((a) => { if (a.parent_id === editing.id) forbidden.add(a.id); });
    }
    return items
      .filter((a) => a.account_type === draft.account_type && !forbidden.has(a.id))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [items, draft.account_type, editing]);

  const scopeLine = (() => {
    const parts: string[] = [`Showing ${groupedTree.visibleCount} of ${totalCount} accounts`];
    if (activeFilter === "active") parts.push("Active only");
    else if (activeFilter === "inactive") parts.push("Inactive only");
    if (typeFilter !== "all") parts.push(ACCOUNT_TYPE_LABEL[typeFilter]);
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    return parts.join(" · ");
  })();

  const renderRow = (a: ChartAccount, depth: 0 | 1) => {
    const cfLabel = a.cash_flow_category ? CASH_FLOW_CATEGORY_LABEL[a.cash_flow_category] : null;
    return (
      <li
        key={a.id}
        className={cn(
          "px-4 py-3 flex items-start gap-3 min-h-[52px]",
          depth === 1 && "pl-10 border-l border-border/40",
        )}
      >
        <span className="font-mono text-xs tabular-nums w-20 shrink-0 text-muted-foreground pt-0.5">{a.code}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{a.name}</div>
          {a.description && (
            <div className="hidden sm:block text-xs text-muted-foreground truncate mt-0.5">{a.description}</div>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end pt-0.5">
          {a.is_cash && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase tracking-wide">Cash</span>}
          {!a.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">Inactive</span>}
          {cfLabel && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">CF: {cfLabel}</span>}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{a.normal_side}</span>
        </div>
        <button
          className="p-2 text-muted-foreground hover:text-primary rounded-md hover:bg-muted min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
          onClick={() => openEdit(a)} title="Edit">
          <Pencil className="h-4 w-4" />
        </button>
        <button
          className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
          onClick={() => beginDelete(a)} title="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </li>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The complete list of accounts used in your books. Edit codes, names, and how they appear on your statements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={rebuilding || !tenantId}>
                {rebuilding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Rebuild Ledger
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
        </div>
      </header>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="mapping">Account Mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 mt-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 min-w-0 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, name, description…"
                className="h-9 pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AccountType | "all")}>
              <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-md border border-border overflow-hidden h-9">
              {(["active", "inactive", "all"] as ActiveFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "px-3 text-xs capitalize min-w-[64px] transition-colors",
                    activeFilter === f ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="sm:ml-auto">
              <Button size="sm" onClick={openNew} className="h-9 w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-1" /> Add Account
              </Button>
            </div>
          </div>

          {/* Type filter pills — live counts from actual accounts */}
          {(() => {
            const pills: { key: AccountType | "all" | "other"; label: string; match: (t: AccountType) => boolean }[] = [
              { key: "all", label: "All", match: () => true },
              { key: "asset", label: "Assets", match: (t) => t === "asset" },
              { key: "liability", label: "Liabilities", match: (t) => t === "liability" },
              { key: "equity", label: "Equity", match: (t) => t === "equity" },
              { key: "revenue", label: "Revenue", match: (t) => t === "revenue" },
              { key: "cogs", label: "Cost of sales", match: (t) => t === "cogs" },
              { key: "opex", label: "Operating expenses", match: (t) => t === "opex" },
              { key: "other", label: "Other", match: (t) => t === "other_income" || t === "other_expense" },
            ];
            const pool = items.filter((a) => {
              if (activeFilter === "active") return a.is_active;
              if (activeFilter === "inactive") return !a.is_active;
              return true;
            });
            const activeKey: string =
              typeFilter === "all" ? "all"
              : (typeFilter === "other_income" || typeFilter === "other_expense") ? "other"
              : typeFilter;
            return (
              <div className="flex flex-wrap gap-1.5">
                {pills.map((p) => {
                  const count = pool.filter((a) => p.match(a.account_type)).length;
                  const isActive = activeKey === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setTypeFilter(p.key === "all" ? "all" : p.key === "other" ? "other_expense" : (p.key as AccountType))}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs transition-colors tabular-nums",
                        isActive
                          ? "bg-foreground text-background border border-foreground"
                          : "bg-muted/40 text-muted-foreground border border-border/50 hover:bg-muted",
                      )}
                    >
                      {p.label} <span className={cn("ml-1", isActive ? "opacity-80" : "opacity-70")}>({count})</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Counter strip + scope line */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground tabular-nums">
              {totalCount} accounts · {totalActive} active · {totalInactive} inactive
            </p>
            <p className="text-xs text-muted-foreground/80">{scopeLine}</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="card-glass p-4"><Skeleton className="h-20 w-full" /></Card>
              ))}
            </div>
          ) : groupedTree.groups.length === 0 ? (
            <Card className="card-glass p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? <>No accounts match “{search.trim()}”</>
                  : <>No accounts match the current filters.</>}
              </p>
            </Card>
          ) : (
            <div className="space-y-5">
              {groupedTree.groups.map(({ type: t, nodes }) => (
                <div key={t}>
                  <div className="flex items-baseline justify-between px-1 mb-2">
                    <h2 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                      {ACCOUNT_TYPE_LABEL[t]}{" "}
                      <span className="text-muted-foreground/60 tabular-nums">
                        ({nodes.reduce((sum, n) => sum + 1 + n.children.length, 0)})
                      </span>
                    </h2>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">{ACCOUNT_TYPE_GROUP[t]}</span>
                  </div>
                  <Card className="card-glass p-0 overflow-hidden">
                    <ul className="divide-y divide-border/40">
                      {nodes.map(({ account, children }) => (
                        <div key={account.id} className={cn(!account.is_active && "opacity-60")}>
                          {renderRow(account, 0)}
                          {children.map((c) => (
                            <div key={c.id} className={cn(!c.is_active && "opacity-60")}>
                              {renderRow(c, 1)}
                            </div>
                          ))}
                        </div>
                      ))}
                    </ul>
                  </Card>
                </div>
              ))}
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
