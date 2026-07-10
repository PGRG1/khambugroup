import { useMemo, useState } from "react";
import { useChartOfAccounts, ChartAccount, AccountType, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_GROUP, defaultNormalSide } from "@/hooks/useChartOfAccounts";
import { useJournal } from "@/hooks/useJournal";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Pencil, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { RevenueMappingMatrix } from "@/components/finance/RevenueMappingMatrix";
import { ProcurementMappingMatrix } from "@/components/finance/ProcurementMappingMatrix";
import { PayrollMappingMatrix } from "@/components/finance/PayrollMappingMatrix";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];

export default function ChartOfAccountsPage() {
  const { items, loading, createAccount, updateAccount, deleteAccount } = useChartOfAccounts();
  const { rebuildFromOperations } = useJournal();
  const { tenantId } = useActiveTenant();
  const isMobile = useIsMobile();
  const [rebuilding, setRebuilding] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [draft, setDraft] = useState<Partial<ChartAccount>>({ account_type: "asset", normal_side: "debit" });

  const grouped = useMemo(() => {
    const m = new Map<AccountType, ChartAccount[]>();
    TYPE_ORDER.forEach((t) => m.set(t, []));
    items.forEach((a) => m.get(a.account_type)?.push(a));
    return m;
  }, [items]);

  const openNew = () => {
    setEditing(null);
    setDraft({ account_type: "asset", normal_side: "debit", is_active: true });
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
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{items.length} accounts · {items.filter((a) => a.is_active).length} active</p>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Account</Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="card-glass p-4"><Skeleton className="h-20 w-full" /></Card>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {TYPE_ORDER.map((t) => {
                const list = grouped.get(t) || [];
                if (list.length === 0) return null;
                return (
                  <div key={t}>
                    <div className="flex items-baseline justify-between px-1 mb-2">
                      <h2 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                        {ACCOUNT_TYPE_LABEL[t]} <span className="text-muted-foreground/60">({list.length})</span>
                      </h2>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">{ACCOUNT_TYPE_GROUP[t]}</span>
                    </div>
                    <Card className="card-glass p-0 overflow-hidden">
                      <ul className="divide-y divide-border/40">
                        {list.map((a) => (
                          <li key={a.id} className={cn("px-4 py-3 flex items-center gap-3 min-h-[52px]", !a.is_active && "opacity-60")}>
                            <span className="font-mono text-xs w-20 shrink-0 text-muted-foreground">{a.code}</span>
                            <span className="flex-1 text-sm min-w-0 truncate">{a.name}</span>
                            <div className="hidden sm:flex items-center gap-1.5">
                              {a.is_cash && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase tracking-wide">Cash</span>}
                              {!a.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">Inactive</span>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{a.normal_side}</span>
                            </div>
                            <button
                              className="p-2 text-muted-foreground hover:text-primary rounded-md hover:bg-muted min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                              onClick={() => openEdit(a)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                              onClick={() => deleteAccount(a.id)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </Card>
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

      <BottomSheetDialog open={editorOpen} onOpenChange={setEditorOpen} className={isMobile ? undefined : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Identity</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Code</label>
                <Input value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="h-10 font-mono" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Name</label>
                <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10" />
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Classification</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Type</label>
                <Select value={draft.account_type} onValueChange={(v) => setDraft({ ...draft, account_type: v as AccountType, normal_side: defaultNormalSide(v as AccountType) })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Normal side</label>
                <Select value={draft.normal_side} onValueChange={(v) => setDraft({ ...draft, normal_side: v as "debit" | "credit" })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Flags</div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <Switch checked={!!draft.is_cash} onCheckedChange={(v) => setDraft({ ...draft, is_cash: v })} /> Cash account
              </label>
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} /> Active
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!draft.code || !draft.name}>{editing ? "Save changes" : "Add account"}</Button>
        </DialogFooter>
      </BottomSheetDialog>
    </div>
  );
}
