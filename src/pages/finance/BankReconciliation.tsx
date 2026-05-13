import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBankReconciliation, BankAccount, BankTxn } from "@/hooks/useBankReconciliation";
import { formatCurrency } from "@/utils/salesUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Upload, Lock, Download, Building2, CheckCircle2, AlertTriangle, Pencil, Info } from "lucide-react";
import { StatementUploadFlow } from "@/components/finance/bank-recon/StatementUploadFlow";
import { TransactionReviewPanel } from "@/components/finance/bank-recon/TransactionReviewPanel";
import { RulesTab } from "@/components/finance/bank-recon/RulesTab";
import { AuditTab } from "@/components/finance/bank-recon/AuditTab";
import { MappingRulesTab } from "@/components/finance/bank-recon/MappingRulesTab";
import { FilteredTxnList } from "@/components/finance/bank-recon/FilteredTxnList";
import { classifyTxn, type UserRule } from "@/utils/bankTxnRules";
import { loadReconMappingRules, matchReconRule, type ReconMappingRule } from "@/utils/reconciliationMappingRules";

const ALL = "__all__";
const ACCOUNT_TYPES = ["HKD Current", "HKD Savings", "Foreign Currency Savings", "USD Current", "Other"];

function statusChip(status: string) {
  const map: Record<string, string> = {
    reconciled: "chip-success",
    matched: "chip-success",
    suggested: "chip-info",
    partial: "chip-warn",
    needs_review: "chip-warn",
    unmatched: "chip-danger",
    duplicate: "chip-warn",
    ignored: "chip-neutral",
    transfer_pending: "chip-info",
    bank_fee: "chip-info",
  };
  return <span className={`chip ${map[status] || "chip-neutral"}`}>{status.replace(/_/g, " ")}</span>;
}

export default function BankReconciliation() {
  const { loading, accounts, transactions, imports, coa, ledgerBalanceFor, statementBalanceFor, reload } = useBankReconciliation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(ALL);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [drawerTxn, setDrawerTxn] = useState<BankTxn | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [userRules, setUserRules] = useState<UserRule[]>([]);
  const [reconRules, setReconRules] = useState<ReconMappingRule[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("bank_recon_rules" as any).select("*").order("sort_order");
      setUserRules((data as any) || []);
      setReconRules(await loadReconMappingRules());
    })();
  }, []);

  const cashAccounts = useMemo(() => coa.filter((c) => c.is_cash), [coa]);
  const filteredAccounts = useMemo(
    () => (selectedAccountId === ALL ? accounts : accounts.filter((a) => a.id === selectedAccountId)),
    [accounts, selectedAccountId]
  );
  const filteredTxns = useMemo(
    () => (selectedAccountId === ALL ? transactions : transactions.filter((t) => t.bank_account_id === selectedAccountId)),
    [transactions, selectedAccountId]
  );
  const filteredImports = useMemo(
    () => (selectedAccountId === ALL ? imports : imports.filter((i) => i.bank_account_id === selectedAccountId)),
    [imports, selectedAccountId]
  );

  const hasAnyStatement = filteredImports.length > 0;

  // KPIs (only meaningful when statements exist)
  const totalStatement = filteredAccounts.reduce((s, a) => s + statementBalanceFor(a.id), 0);
  const totalLedger = filteredAccounts.reduce((s, a) => s + ledgerBalanceFor(a), 0);
  const difference = totalStatement - totalLedger;
  const matchedCount = filteredTxns.filter((t) => ["matched", "reconciled"].includes(t.status)).length;
  const unmatchedCount = filteredTxns.filter((t) => t.status === "unmatched").length;
  const reviewCount = filteredTxns.filter((t) => ["needs_review", "suggested", "partial"].includes(t.status)).length;
  const reconciledAccounts = filteredAccounts.filter((a) => Math.abs(statementBalanceFor(a.id) - ledgerBalanceFor(a)) < 0.01).length;

  const statusLabel = (() => {
    if (!hasAnyStatement) return { label: "No Statement Uploaded", tone: "neutral" as const };
    if (Math.abs(difference) < 0.01 && unmatchedCount === 0 && reviewCount === 0) return { label: "Reconciled", tone: "success" as const };
    if (matchedCount > 0 && (unmatchedCount > 0 || reviewCount > 0)) return { label: "In Review", tone: "warn" as const };
    if (matchedCount > 0 && Math.abs(difference) > 0.01) return { label: "Partially Reconciled", tone: "warn" as const };
    return { label: "Imported", tone: "info" as const };
  })();

  const dash = "—";
  const v = (val: string) => (hasAnyStatement ? val : dash);

  // Filtered subsets for tabs
  const txWith = (type: string) => filteredTxns.filter((t) => {
    const rec = matchReconRule(t.description, Number(t.money_in), Number(t.money_out), reconRules);
    const cls = rec ? null : classifyTxn(t.description, Number(t.money_in), Number(t.money_out), userRules);
    return ((t as any).suggested_type || rec?.suggested_type || cls?.suggested_type) === type;
  });
  const kpayTxns = txWith("kpay_settlement");
  const cashDepositTxns = txWith("cash_deposit");
  const supplierTxns = txWith("supplier_payment");
  const transferTxns = txWith("internal_transfer");
  const unmatchedTxns = filteredTxns.filter((t) => t.status === "unmatched");
  const suggestedTxns = filteredTxns.filter((t) => ["suggested", "partial"].includes(t.status));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Bank Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">Reconcile each bank, cash, and settlement account against the ledger.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Bank Accounts (Consolidated)</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.account_name}{a.account_number_last4 ? ` ····${a.account_number_last4}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload Statement
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Lock className="h-4 w-4" /> Lock Period
          </Button>
        </div>
      </div>

      {accounts.length === 0 && !loading && (
        <Card className="card-glass border-amber-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="h-5 w-5 text-amber-400" />
            <div className="flex-1 text-sm">No bank accounts added yet. Add a bank account or upload a statement to begin.</div>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Account</Button>
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload Statement</Button>
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <Kpi label="Statement Balance" value={v(formatCurrency(totalStatement))} />
        <Kpi label="Ledger Balance" value={v(formatCurrency(totalLedger))} />
        <Kpi
          label="Difference"
          value={v(formatCurrency(difference))}
          tone={!hasAnyStatement ? "neutral" : Math.abs(difference) < 0.01 ? "success" : "danger"}
        />
        <Kpi label="Matched" value={v(String(matchedCount))} tone={hasAnyStatement ? "success" : "neutral"} />
        <Kpi label="Unmatched" value={v(String(unmatchedCount))} tone={hasAnyStatement && unmatchedCount > 0 ? "danger" : "neutral"} />
        <Kpi label="Needs Review" value={v(String(reviewCount))} tone={hasAnyStatement && reviewCount > 0 ? "warn" : "neutral"} />
        <Kpi label="Status" value={statusLabel.label} tone={statusLabel.tone} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Bank Transactions</TabsTrigger>
          <TabsTrigger value="suggested">Suggested Matches</TabsTrigger>
          <TabsTrigger value="kpay">KPay</TabsTrigger>
          <TabsTrigger value="cash">Cash Deposits</TabsTrigger>
          <TabsTrigger value="suppliers">Supplier Payments</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
          <TabsTrigger value="mapping-rules">Mapping Rules</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="card-glass">
            <CardHeader><CardTitle className="text-base">Account Status</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="flex items-center gap-4 mb-4 text-sm">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {reconciledAccounts} Reconciled</span>
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> {filteredAccounts.length - reconciledAccounts} Open</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Bank Account</th>
                    <th className="text-left py-2 px-2">Type</th>
                    <th className="text-left py-2 px-2">Currency</th>
                    <th className="text-right py-2 px-2">Statement</th>
                    <th className="text-right py-2 px-2">Ledger</th>
                    <th className="text-right py-2 px-2">Difference</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">
                      {loading ? "Loading…" : "No bank accounts yet. Add one in the Bank Accounts tab."}
                    </td></tr>
                  )}
                  {filteredAccounts.map((a) => {
                    const acctImports = imports.filter((i) => i.bank_account_id === a.id);
                    const sb = statementBalanceFor(a.id);
                    const lb = ledgerBalanceFor(a);
                    const d = sb - lb;
                    const reconciled = Math.abs(d) < 0.01;
                    const hasStmt = acctImports.length > 0;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-2 px-2 font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{a.account_name}</td>
                        <td className="py-2 px-2 text-muted-foreground">{(a as any).account_type || "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{a.currency}</td>
                        <td className="py-2 px-2 text-right td-num">{hasStmt ? formatCurrency(sb) : dash}</td>
                        <td className="py-2 px-2 text-right td-num">{hasStmt ? formatCurrency(lb) : dash}</td>
                        <td className={`py-2 px-2 text-right td-num ${hasStmt && !reconciled ? "text-rose-400" : ""}`}>{hasStmt ? formatCurrency(d) : dash}</td>
                        <td className="py-2 px-2">
                          {!hasStmt ? <span className="chip chip-neutral">No Statement Uploaded</span> :
                            reconciled ? <span className="chip chip-success">Reconciled</span> : <span className="chip chip-warn">Needs Review</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card className="card-glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Bank Account Master</CardTitle>
              <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Account</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Account Name</th>
                    <th className="text-left py-2 px-2">Bank</th>
                    <th className="text-left py-2 px-2">Last 4</th>
                    <th className="text-left py-2 px-2">Type</th>
                    <th className="text-left py-2 px-2">Currency</th>
                    <th className="text-left py-2 px-2">Linked GL</th>
                    <th className="text-right py-2 px-2">Statement</th>
                    <th className="text-right py-2 px-2">Ledger</th>
                    <th className="text-right py-2 px-2">Difference</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No bank accounts. Click "Add Account" to start.</td></tr>
                  )}
                  {accounts.map((a) => {
                    const gl = coa.find((c) => c.id === a.linked_gl_account_id);
                    const acctImports = imports.filter((i) => i.bank_account_id === a.id);
                    const hasStmt = acctImports.length > 0;
                    const sb = statementBalanceFor(a.id);
                    const lb = ledgerBalanceFor(a);
                    const d = sb - lb;
                    const reconciled = Math.abs(d) < 0.01;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-2 px-2 font-medium">{a.account_name}</td>
                        <td className="py-2 px-2">{a.bank_name || "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{a.account_number_last4 || "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{(a as any).account_type || "—"}</td>
                        <td className="py-2 px-2">{a.currency}</td>
                        <td className="py-2 px-2">{gl ? <span className="text-xs">{gl.code} · {gl.name}</span> : <span className="chip chip-warn">Not linked</span>}</td>
                        <td className="py-2 px-2 text-right td-num">{hasStmt ? formatCurrency(sb) : dash}</td>
                        <td className="py-2 px-2 text-right td-num">{hasStmt ? formatCurrency(lb) : dash}</td>
                        <td className={`py-2 px-2 text-right td-num ${hasStmt && !reconciled ? "text-rose-400" : ""}`}>{hasStmt ? formatCurrency(d) : dash}</td>
                        <td className="py-2 px-2">
                          {!a.is_active ? <span className="chip chip-neutral">Inactive</span> :
                            !hasStmt ? <span className="chip chip-neutral">No Statement</span> :
                            reconciled ? <span className="chip chip-success">Reconciled</span> : <span className="chip chip-warn">Needs Review</span>}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(a)}><Pencil className="h-3 w-3" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="card-glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Bank Transactions</CardTitle>
              <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload Statement</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-left py-2 px-2">Account</th>
                    <th className="text-left py-2 px-2">Description</th>
                    <th className="text-left py-2 px-2">Suggested</th>
                    <th className="text-right py-2 px-2">In</th>
                    <th className="text-right py-2 px-2">Out</th>
                    <th className="text-right py-2 px-2">Balance</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                      No bank transactions yet. Upload a PDF statement to extract transactions.
                    </td></tr>
                  )}
                  {filteredTxns.map((t) => {
                    const acct = accounts.find((a) => a.id === t.bank_account_id);
                    const rec = matchReconRule(t.description, Number(t.money_in), Number(t.money_out), reconRules);
                    const sugg = (t as any).suggested_type || rec?.suggested_type || classifyTxn(t.description, Number(t.money_in), Number(t.money_out), userRules)?.suggested_type;
                    return (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-card/50 cursor-pointer" onClick={() => setDrawerTxn(t)}>
                        <td className="py-2 px-2">{t.txn_date}</td>
                        <td className="py-2 px-2 text-xs">{acct?.account_name || "—"}</td>
                        <td className="py-2 px-2 text-xs truncate max-w-[280px]">{t.description}</td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">{sugg || "—"}</td>
                        <td className="py-2 px-2 text-right td-num text-emerald-400">{Number(t.money_in) > 0 ? formatCurrency(Number(t.money_in)) : ""}</td>
                        <td className="py-2 px-2 text-right td-num text-rose-400">{Number(t.money_out) > 0 ? formatCurrency(Number(t.money_out)) : ""}</td>
                        <td className="py-2 px-2 text-right td-num text-muted-foreground">{t.running_balance != null ? formatCurrency(Number(t.running_balance)) : ""}</td>
                        <td className="py-2 px-2">{statusChip(t.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggested">
          <FilteredTxnList title="Suggested Matches" emptyMessage="No suggested matches yet." txns={suggestedTxns} accounts={accounts} onOpen={setDrawerTxn} />
        </TabsContent>
        <TabsContent value="kpay">
          <FilteredTxnList title="KPay Settlements" extraNote="Venue allocation comes from KPay / Daily Sales source records, not from the bank line." emptyMessage="No KPay deposits detected yet." txns={kpayTxns} accounts={accounts} onOpen={setDrawerTxn} />
        </TabsContent>
        <TabsContent value="cash">
          <FilteredTxnList title="Cash Deposits (ATM/CDM)" extraNote="Cash deposits clear Cash on Hand. They do not create new revenue." emptyMessage="No cash machine deposits detected yet." txns={cashDepositTxns} accounts={accounts} onOpen={setDrawerTxn} />
        </TabsContent>
        <TabsContent value="suppliers">
          <FilteredTxnList title="Supplier Payments" emptyMessage="No supplier payments detected yet." txns={supplierTxns} accounts={accounts} onOpen={setDrawerTxn} />
        </TabsContent>
        <TabsContent value="transfers">
          <FilteredTxnList title="Internal Transfers" extraNote="Internal transfers do not affect P&L." emptyMessage="No internal transfers detected yet." txns={transferTxns} accounts={accounts} onOpen={setDrawerTxn} />
        </TabsContent>
        <TabsContent value="unmatched">
          <FilteredTxnList title="Unmatched" emptyMessage="No unmatched transactions." txns={unmatchedTxns} accounts={accounts} onOpen={setDrawerTxn} />
        </TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>

      {/* Account editor */}
      <AccountEditor
        open={creating || !!editing}
        account={editing}
        coa={cashAccounts}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
      />

      {/* Statement upload (PDF + AI extraction) */}
      <StatementUploadFlow
        open={uploadOpen}
        accounts={accounts}
        onClose={() => setUploadOpen(false)}
        onCommitted={() => setUploadOpen(false)}
        reload={reload}
      />

      {/* Transaction detail / review */}
      <TransactionReviewPanel
        txn={drawerTxn}
        accounts={accounts}
        userRules={userRules}
        reconRules={reconRules}
        onClose={() => setDrawerTxn(null)}
        onChanged={reload}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "warn" | "neutral" | "info" }) {
  const toneCls =
    tone === "success" ? "text-emerald-400" :
    tone === "danger" ? "text-rose-400" :
    tone === "warn" ? "text-amber-400" :
    tone === "info" ? "text-sky-400" : "";
  return (
    <Card className="card-glass">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold td-num mt-1 ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/** Account editor dialog */
function AccountEditor({
  open, account, coa, onClose, onSaved,
}: {
  open: boolean;
  account: BankAccount | null;
  coa: { id: string; code: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<BankAccount> & { account_type?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(account || { currency: "HKD", is_active: true, opening_balance: 0, opening_date: new Date().toISOString().slice(0, 10), account_type: "HKD Current" });
    }
  }, [open, account]);

  const save = async () => {
    if (!form.account_name) {
      toast({ title: "Account name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      account_name: form.account_name,
      bank_name: form.bank_name || "",
      account_number_last4: form.account_number_last4 || "",
      account_type: form.account_type || "HKD Current",
      currency: form.currency || "HKD",
      venue: form.venue || null,
      entity: form.entity || null,
      linked_gl_account_id: form.linked_gl_account_id || null,
      opening_balance: Number(form.opening_balance || 0),
      opening_date: form.opening_date || new Date().toISOString().slice(0, 10),
      is_active: form.is_active ?? true,
      notes: form.notes || "",
    };
    let err;
    if (account) {
      ({ error: err } = await supabase.from("bank_accounts").update(payload).eq("id", account.id));
    } else {
      ({ error: err } = await supabase.from("bank_accounts").insert(payload));
    }
    setSaving(false);
    if (err) toast({ title: "Save failed", description: err.message, variant: "destructive" });
    else { toast({ title: account ? "Account updated" : "Account created" }); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Bank Account" : "New Bank Account"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Account Name *</Label>
            <Input value={form.account_name || ""} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="BOCHK HKD Current" />
          </div>
          <div>
            <Label>Bank</Label>
            <Input value={form.bank_name || ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="BOCHK" />
          </div>
          <div>
            <Label>Account Number / Last 4</Label>
            <Input value={form.account_number_last4 || ""} onChange={(e) => setForm({ ...form, account_number_last4: e.target.value })} maxLength={6} />
          </div>
          <div>
            <Label>Account Type</Label>
            <Select value={form.account_type || "HKD Current"} onValueChange={(v) => setForm({ ...form, account_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency || ""} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Linked GL Account (cash accounts)</Label>
            <Select value={form.linked_gl_account_id || "__none__"} onValueChange={(v) => setForm({ ...form, linked_gl_account_id: v === "__none__" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Select cash GL account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {coa.map((c) => (<SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Reconciliation requires a linked GL cash account.</p>
          </div>
          <div>
            <Label>Opening Balance</Label>
            <Input type="number" step="0.01" value={String(form.opening_balance ?? 0)} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Opening Date</Label>
            <Input type="date" value={form.opening_date || ""} onChange={(e) => setForm({ ...form, opening_date: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
