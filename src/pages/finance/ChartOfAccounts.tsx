import {AccountingTab} from '@/components/settings/AccountingTab';
import { Fragment, useMemo, useState } from "react";
import { PageTop } from "@/components/kit/PageTop";
import { Toolbar } from "@/components/kit/Toolbar";
import { QuickFilter } from "@/components/kit/QuickFilter";
import { downloadCSV } from "@/utils/csvDownload";
import { formatTableInteger } from "@/utils/format";
import { Section, PhoneRow, GroupHead, Note, Empty, keyOpen } from "@/components/finance/accounting/AccountingKit";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {AccountReviewNote} from "@/components/finance/AccountReviewNote";
import { DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { RevenueMappingMatrix } from "@/components/finance/RevenueMappingMatrix";
import { ProcurementMappingMatrix } from "@/components/finance/ProcurementMappingMatrix";
import { PayrollMappingMatrix } from "@/components/finance/PayrollMappingMatrix";
import { ExpenseMappingMatrix } from "@/components/finance/ExpenseMappingMatrix";
import {AccountMerge} from '@/components/finance/AccountMerge';

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];
type ActiveFilter = "active" | "inactive" | "all";
const FRIENDLY: Record<string, string> = { asset: "What you own", liability: "What you owe", equity: "Owner's equity", revenue: "Income", cogs: "Cost of sales", opex: "Running costs", other_income: "Other income", other_expense: "Other costs" };

export default function ChartOfAccountsPage() {
  const { items, loading, createAccount, updateAccount, deleteAccount, countJournalLines, fetchAll } = useChartOfAccounts();
  const { rebuildFromOperations } = useJournal();
  const { tenantId } = useActiveTenant();
  const [rebuilding, setRebuilding] = useState(false);
  const [mapping, setMapping] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [draft, setDraft] = useState<Partial<ChartAccount>>({ account_type: "asset", normal_side: "debit" });

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "all" | "other">("all");
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
      if (typeFilter === "other") {
        if (a.account_type !== "other_income" && a.account_type !== "other_expense") return false;
      } else if (typeFilter !== "all" && a.account_type !== typeFilter) return false;
      if (q) {
        const hay = `${a.code} ${a.name} ${a.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, typeFilter, activeFilter]);

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

  // Settings is for setting the accounts up: no balances or ledger links here (those live in Finance).
  const groups = TYPE_ORDER.map(t => ({ t, list: filtered.filter(a => a.account_type === t).sort((a, b) => (a.sort_order - b.sort_order) || a.code.localeCompare(b.code)) })).filter(g => g.list.length);
  const usedFor = (a: ChartAccount) => [a.is_cash ? "Cash account" : null, a.cash_flow_category ? `Cash flow · ${CASH_FLOW_CATEGORY_LABEL[a.cash_flow_category]}` : null].filter(Boolean).join(" · ") || "—";
  const download = () => downloadCSV(filtered.map(a => ({ code: a.code, name: a.name, type: ACCOUNT_TYPE_LABEL[a.account_type], side: a.normal_side, active: a.is_active ? "Yes" : "No" })), [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "type", label: "Type" }, { key: "side", label: "Normal side" }, { key: "active", label: "Active" }], "chart_of_accounts");
  const AREAS: [string, string, string][] = [["sales", "Sales", "Food, drinks, service charge, discounts"], ["payments", "Payment methods", "Cash, cards, wallets, delivery apps"], ["procurement", "Purchasing", "Stock and supplies by category"], ["payroll", "Payroll", "Wages, MPF, allowances"], ["expenses", "Expenses", "Rent, utilities, repairs"], ["categories", "Bills and cash receipts", "Bill and receipt categories"]];
  const area = AREAS.find(a => a[0] === mapping);
  const typeChip = <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AccountType | "all" | "other")}><SelectTrigger className="h-9 w-40 rounded-full" aria-label="Account type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select>;

  return (
    <div className="min-w-0 space-y-5 max-sm:space-y-3">
      <PageTop tabsAbove title="Chart of accounts" actions={<Button size="sm" className="h-10" onClick={openNew}><Plus className="h-4 w-4" />Add account</Button>} />
      <AccountReviewNote accounts={items} onSaved={() => void fetchAll()} />
      <Section title="Accounts" detail={`${formatTableInteger(totalActive)} in use${totalInactive ? ` · ${formatTableInteger(totalInactive)} hidden` : ""}`} busy={loading}>
        <QuickFilter label="Accounts" value={activeFilter} onChange={setActiveFilter} options={[{ key: "active", label: "In use" }, { key: "inactive", label: "Hidden" }, { key: "all", label: "All" }]} />
        <Toolbar search={search} onSearch={setSearch} placeholder="Search accounts" mobileSearchBelow filter={typeChip} onDownload={download} downloadLabel="Download chart of accounts" />
        <div className="min-[768px]:hidden kit">{groups.map(g => <Fragment key={g.t}><GroupHead name={`${FRIENDLY[g.t] ?? g.t} · ${g.list.length}`} />
          <ul className="divide-y divide-border/60 border-t border-border/60">{g.list.map(a => <PhoneRow key={a.id} title={a.name} amount={a.is_active ? undefined : "Hidden"} sub={`${a.code} · ${ACCOUNT_TYPE_LABEL[a.account_type]}`} onOpen={() => openEdit(a)} />)}</ul></Fragment>)}</div>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Accounts table"><table className="sales-table" aria-label="Chart of accounts">
          <thead><tr><th scope="col" className="sales-cell-left">Code</th><th scope="col" className="sales-cell-left">Account</th><th scope="col" className="sales-cell-left">Type</th><th scope="col" className="sales-cell-left">Used for</th><th scope="col" className="sales-cell-right">Status</th></tr></thead>
          <tbody>{groups.map(g => <Fragment key={g.t}>
            <tr className="sales-week-row"><th colSpan={5}><span>{FRIENDLY[g.t] ?? g.t} · {g.list.length}</span></th></tr>
            {g.list.map(a => <tr key={a.id} className="sales-record-row" {...keyOpen(() => openEdit(a))}>
              <td className="sales-cell-left">{a.code}</td>
              <td className="sales-cell-left" title={a.description ? `${a.name} · ${a.description}` : a.name}>{a.name}</td>
              <td className="sales-cell-left">{ACCOUNT_TYPE_LABEL[a.account_type]}</td>
              <td className="sales-cell-left text-muted-foreground">{usedFor(a)}</td>
              <td className={a.is_active ? "kit-num" : "kit-num text-muted-foreground"}>{a.is_system ? "🔒 System" : a.is_active ? "In use" : "Hidden"}</td>
            </tr>)}</Fragment>)}</tbody></table></div>
        {!groups.length && <Empty>{loading ? "Loading accounts…" : "No accounts found."}</Empty>}
        <div className="flex flex-wrap items-center gap-2 px-1"><AccountMerge accounts={items} onSaved={() => void fetchAll()} />
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={rebuilding || !tenantId}>{rebuilding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}Rebuild ledger</Button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rebuild ledger from operations?</AlertDialogTitle><AlertDialogDescription>Regenerates all auto-derived journal entries for this tenant. Manually-edited entries are preserved.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doRebuild}>Rebuild now</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog></div>
        <Note>Tap an account to edit it. Accounts with lines can be hidden, not deleted.</Note>
      </Section>
      <Section title="How things post" detail="where each kind of money goes in the books">
        <ul className="min-[768px]:hidden kit divide-y divide-border/60">{AREAS.map(([k, name, covers]) => <PhoneRow key={k} title={name} sub={covers} onOpen={() => setMapping(k)} />)}</ul>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="How things post table"><table className="sales-table" aria-label="How things post">
          <thead><tr><th scope="col" className="sales-cell-left">Area</th><th scope="col" className="sales-cell-left">Covers</th><th scope="col" className="sales-cell-right"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{AREAS.map(([k, name, covers]) => <tr key={k} className="sales-record-row" {...keyOpen(() => setMapping(k))}><td className="sales-cell-left font-medium">{name}</td><td className="sales-cell-left text-muted-foreground">{covers}</td><td className="kit-num"><span className="kit-link">Open</span></td></tr>)}</tbody></table></div>
        <Note>Tap an area to choose which account each item posts to.</Note>
      </Section>
      <Dialog open={!!area} onOpenChange={o => !o && setMapping(null)}><DialogContent className="w-[calc(100%-2rem)] max-w-5xl max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>How things post · {area?.[1]}</DialogTitle></DialogHeader>
        {mapping === "sales" && <RevenueMappingMatrix accounts={items} section="sales" />}
        {mapping === "payments" && <RevenueMappingMatrix accounts={items} section="payments" />}
        {mapping === "procurement" && <ProcurementMappingMatrix accounts={items} />}
        {mapping === "payroll" && <PayrollMappingMatrix accounts={items} />}
        {mapping === "expenses" && <ExpenseMappingMatrix accounts={items} />}
        {mapping === "categories" && <AccountingTab destination="mappings" />}
      </DialogContent></Dialog>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
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
          {editing && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => { const a = editing; setEditorOpen(false); void beginDelete(a); }}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>}
          <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!draft.code || !draft.name}>{editing ? "Save changes" : "Add account"}</Button>
        </DialogFooter>
      </DialogContent></Dialog>

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
