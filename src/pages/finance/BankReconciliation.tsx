import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBankReconciliation, BankAccount, BankTxn } from "@/hooks/useBankReconciliation";
import { formatCurrency } from "@/utils/salesUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Upload, Lock, Download, Building2, CheckCircle2, AlertTriangle, FileWarning, Pencil } from "lucide-react";

const ALL = "__all__";

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
  const { loading, accounts, transactions, coa, ledgerBalanceFor, statementBalanceFor, reload } = useBankReconciliation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(ALL);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [drawerTxn, setDrawerTxn] = useState<BankTxn | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const cashAccounts = useMemo(() => coa.filter((c) => c.is_cash), [coa]);
  const filteredAccounts = useMemo(
    () => (selectedAccountId === ALL ? accounts : accounts.filter((a) => a.id === selectedAccountId)),
    [accounts, selectedAccountId]
  );
  const filteredTxns = useMemo(
    () => (selectedAccountId === ALL ? transactions : transactions.filter((t) => t.bank_account_id === selectedAccountId)),
    [transactions, selectedAccountId]
  );

  // KPIs
  const totalStatement = filteredAccounts.reduce((s, a) => s + statementBalanceFor(a.id), 0);
  const totalLedger = filteredAccounts.reduce((s, a) => s + ledgerBalanceFor(a), 0);
  const difference = totalStatement - totalLedger;
  const matchedCount = filteredTxns.filter((t) => ["matched", "reconciled"].includes(t.status)).length;
  const unmatchedCount = filteredTxns.filter((t) => t.status === "unmatched").length;
  const reviewCount = filteredTxns.filter((t) => ["needs_review", "suggested", "partial"].includes(t.status)).length;
  const reconciledAccounts = filteredAccounts.filter((a) => Math.abs(statementBalanceFor(a.id) - ledgerBalanceFor(a)) < 0.01).length;

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
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} disabled={selectedAccountId === ALL}>
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Statement Balance" value={formatCurrency(totalStatement)} />
        <Kpi label="Ledger Balance" value={formatCurrency(totalLedger)} />
        <Kpi
          label="Difference"
          value={formatCurrency(difference)}
          tone={Math.abs(difference) < 0.01 ? "success" : "danger"}
          chip={Math.abs(difference) < 0.01 ? "Reconciled" : "Needs Review"}
        />
        <Kpi label="Matched" value={String(matchedCount)} tone="success" />
        <Kpi label="Unmatched" value={String(unmatchedCount)} tone={unmatchedCount > 0 ? "danger" : "neutral"} />
        <Kpi label="Needs Review" value={String(reviewCount)} tone={reviewCount > 0 ? "warn" : "neutral"} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Bank Transactions</TabsTrigger>
          <TabsTrigger value="suggested" disabled>Suggested Matches</TabsTrigger>
          <TabsTrigger value="kpay" disabled>KPay</TabsTrigger>
          <TabsTrigger value="cash" disabled>Cash Deposits</TabsTrigger>
          <TabsTrigger value="suppliers" disabled>Supplier Payments</TabsTrigger>
          <TabsTrigger value="transfers" disabled>Transfers</TabsTrigger>
          <TabsTrigger value="unmatched" disabled>Unmatched</TabsTrigger>
          <TabsTrigger value="journals" disabled>Journals</TabsTrigger>
          <TabsTrigger value="rules" disabled>Rules</TabsTrigger>
          <TabsTrigger value="audit" disabled>Audit</TabsTrigger>
          <TabsTrigger value="close" disabled>Period Close</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="card-glass">
            <CardHeader>
              <CardTitle className="text-base">Account Status</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="flex items-center gap-4 mb-4 text-sm">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {reconciledAccounts} Reconciled</span>
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> {filteredAccounts.length - reconciledAccounts} Open</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Bank Account</th>
                    <th className="text-left py-2 px-2">Venue</th>
                    <th className="text-left py-2 px-2">Currency</th>
                    <th className="text-right py-2 px-2">Statement Balance</th>
                    <th className="text-right py-2 px-2">Ledger Balance</th>
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
                    const sb = statementBalanceFor(a.id);
                    const lb = ledgerBalanceFor(a);
                    const d = sb - lb;
                    const reconciled = Math.abs(d) < 0.01;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-2 px-2 font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{a.account_name}</td>
                        <td className="py-2 px-2 text-muted-foreground">{a.venue || "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{a.currency}</td>
                        <td className="py-2 px-2 text-right td-num">{formatCurrency(sb)}</td>
                        <td className="py-2 px-2 text-right td-num">{formatCurrency(lb)}</td>
                        <td className={`py-2 px-2 text-right td-num ${reconciled ? "" : "text-rose-400"}`}>{formatCurrency(d)}</td>
                        <td className="py-2 px-2">{reconciled ? <span className="chip chip-success">Reconciled</span> : <span className="chip chip-warn">Needs Review</span>}</td>
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
                    <th className="text-left py-2 px-2">Venue</th>
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
                    const sb = statementBalanceFor(a.id);
                    const lb = ledgerBalanceFor(a);
                    const d = sb - lb;
                    const reconciled = Math.abs(d) < 0.01;
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-2 px-2 font-medium">{a.account_name}</td>
                        <td className="py-2 px-2">{a.bank_name || "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{a.account_number_last4 || "—"}</td>
                        <td className="py-2 px-2">{a.venue || "—"}</td>
                        <td className="py-2 px-2">{a.currency}</td>
                        <td className="py-2 px-2">{gl ? <span className="text-xs">{gl.code} · {gl.name}</span> : <span className="chip chip-danger">Not linked</span>}</td>
                        <td className="py-2 px-2 text-right td-num">{formatCurrency(sb)}</td>
                        <td className="py-2 px-2 text-right td-num">{formatCurrency(lb)}</td>
                        <td className={`py-2 px-2 text-right td-num ${reconciled ? "" : "text-rose-400"}`}>{formatCurrency(d)}</td>
                        <td className="py-2 px-2">
                          {!a.is_active ? <span className="chip chip-neutral">Inactive</span> :
                            !a.linked_gl_account_id ? <span className="chip chip-warn">Statement missing</span> :
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
              {selectedAccountId !== ALL && (
                <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload Statement</Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-left py-2 px-2">Bank Account</th>
                    <th className="text-left py-2 px-2">Description</th>
                    <th className="text-left py-2 px-2">Reference</th>
                    <th className="text-right py-2 px-2">Money In</th>
                    <th className="text-right py-2 px-2">Money Out</th>
                    <th className="text-right py-2 px-2">Balance</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                      No bank transactions yet. {selectedAccountId === ALL ? "Select an account and upload a statement." : "Upload a statement to get started."}
                    </td></tr>
                  )}
                  {filteredTxns.map((t) => {
                    const acct = accounts.find((a) => a.id === t.bank_account_id);
                    return (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-card/50 cursor-pointer" onClick={() => setDrawerTxn(t)}>
                        <td className="py-2 px-2">{t.txn_date}</td>
                        <td className="py-2 px-2">{acct?.account_name || "—"}</td>
                        <td className="py-2 px-2">{t.description}</td>
                        <td className="py-2 px-2 text-muted-foreground">{t.reference || "—"}</td>
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
      </Tabs>

      {/* Account editor */}
      <AccountEditor
        open={creating || !!editing}
        account={editing}
        coa={cashAccounts}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
      />

      {/* Statement upload */}
      <StatementUpload
        open={uploadOpen}
        bankAccountId={selectedAccountId !== ALL ? selectedAccountId : null}
        accountName={accounts.find((a) => a.id === selectedAccountId)?.account_name}
        onClose={() => setUploadOpen(false)}
        onSaved={() => { setUploadOpen(false); reload(); }}
      />

      {/* Transaction detail */}
      <Sheet open={!!drawerTxn} onOpenChange={(o) => !o && setDrawerTxn(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Transaction Detail</SheetTitle>
          </SheetHeader>
          {drawerTxn && (
            <div className="space-y-3 text-sm mt-4">
              <DetailRow label="Date" value={drawerTxn.txn_date} />
              <DetailRow label="Bank Account" value={accounts.find((a) => a.id === drawerTxn.bank_account_id)?.account_name || "—"} />
              <DetailRow label="Description" value={drawerTxn.description} />
              <DetailRow label="Reference" value={drawerTxn.reference || "—"} />
              <DetailRow label="Money In" value={formatCurrency(Number(drawerTxn.money_in))} />
              <DetailRow label="Money Out" value={formatCurrency(Number(drawerTxn.money_out))} />
              <DetailRow label="Status" value={drawerTxn.status} />
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2"><FileWarning className="h-3 w-3" /> Matching, journal creation and transfer detection arrive in Phase 2.</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, tone, chip }: { label: string; value: string; tone?: "success" | "danger" | "warn" | "neutral"; chip?: string }) {
  const toneCls = tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "";
  return (
    <Card className="card-glass">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold td-num mt-1 ${toneCls}`}>{value}</div>
        {chip && <div className="mt-2"><span className={`chip ${tone === "success" ? "chip-success" : "chip-warn"}`}>{chip}</span></div>}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
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
  const [form, setForm] = useState<Partial<BankAccount>>({});
  const [saving, setSaving] = useState(false);

  // initialize form when opening
  useMemo(() => {
    if (open) {
      setForm(account || { currency: "HKD", is_active: true, opening_balance: 0, opening_date: new Date().toISOString().slice(0, 10) });
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
            <Input value={form.account_name || ""} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="HSBC Operating Account" />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input value={form.bank_name || ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="HSBC" />
          </div>
          <div>
            <Label>Last 4 Digits</Label>
            <Input value={form.account_number_last4 || ""} onChange={(e) => setForm({ ...form, account_number_last4: e.target.value })} maxLength={4} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency || ""} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div>
            <Label>Venue</Label>
            <Select value={form.venue || "__none__"} onValueChange={(v) => setForm({ ...form, venue: v === "__none__" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {["Assembly", "Caliente", "Hanabi", "Events"].map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Statement upload — CSV paste/upload */
function StatementUpload({
  open, bankAccountId, accountName, onClose, onSaved,
}: {
  open: boolean;
  bankAccountId: string | null;
  accountName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [openingBal, setOpeningBal] = useState("0");
  const [closingBal, setClosingBal] = useState("0");
  const [csvText, setCsvText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPeriodStart(""); setPeriodEnd(""); setOpeningBal("0"); setClosingBal("0"); setCsvText(""); setFile(null);
  };

  const parseCsv = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 1) return [];
    // detect header
    const first = lines[0].toLowerCase();
    const hasHeader = /date/.test(first) && /(amount|in|out|debit|credit)/.test(first);
    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map((line) => {
      const cols = line.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      // expected columns: date, description, reference, money_in, money_out, balance
      // tolerate amount-only column (negative = out)
      const [date, description = "", reference = "", inS = "", outS = "", balS = ""] = cols;
      let mi = parseFloat(inS) || 0;
      let mo = parseFloat(outS) || 0;
      // if only one amount column was provided
      if (mi === 0 && mo === 0 && cols.length >= 4) {
        const amt = parseFloat(cols[3]) || 0;
        if (amt >= 0) mi = amt; else mo = Math.abs(amt);
      }
      return {
        txn_date: date,
        description,
        reference,
        money_in: mi,
        money_out: mo,
        running_balance: parseFloat(balS) || null,
      };
    }).filter((r) => r.txn_date && /^\d{4}-\d{2}-\d{2}$/.test(r.txn_date));
  };

  const submit = async () => {
    if (!bankAccountId) return;
    if (!periodStart || !periodEnd) {
      toast({ title: "Period required", variant: "destructive" });
      return;
    }
    const rows = parseCsv(csvText);
    if (rows.length === 0 && !file) {
      toast({ title: "Add CSV rows or attach a file", variant: "destructive" });
      return;
    }
    setSaving(true);
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    if (file) {
      const path = `${bankAccountId}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("bank-statements").upload(path, file);
      if (upErr) {
        setSaving(false);
        toast({ title: "File upload failed", description: upErr.message, variant: "destructive" });
        return;
      }
      fileUrl = path;
      fileName = file.name;
    }
    const { data: imp, error: impErr } = await supabase.from("bank_statement_imports").insert({
      bank_account_id: bankAccountId,
      period_start: periodStart,
      period_end: periodEnd,
      opening_balance: Number(openingBal) || 0,
      closing_balance: Number(closingBal) || 0,
      file_url: fileUrl,
      file_name: fileName,
      status: "imported",
    }).select("id").single();
    if (impErr || !imp) {
      setSaving(false);
      toast({ title: "Import failed", description: impErr?.message, variant: "destructive" });
      return;
    }
    if (rows.length > 0) {
      const txnPayload = rows.map((r) => ({ ...r, import_id: imp.id, bank_account_id: bankAccountId, status: "unmatched" }));
      const { error: txnErr } = await supabase.from("bank_transactions").insert(txnPayload);
      if (txnErr) {
        setSaving(false);
        toast({ title: "Transactions insert failed", description: txnErr.message, variant: "destructive" });
        return;
      }
    }
    setSaving(false);
    toast({ title: "Statement imported", description: `${rows.length} transactions added` });
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Statement {accountName ? `— ${accountName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div>
              <Label>Opening Balance</Label>
              <Input type="number" step="0.01" value={openingBal} onChange={(e) => setOpeningBal(e.target.value)} />
            </div>
            <div>
              <Label>Closing Balance</Label>
              <Input type="number" step="0.01" value={closingBal} onChange={(e) => setClosingBal(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Statement File (optional, PDF/CSV — stored for reference)</Label>
            <Input type="file" accept=".csv,.pdf,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <Label>Transactions CSV</Label>
            <textarea
              className="w-full h-40 rounded-md border border-input bg-background p-2 text-sm font-mono"
              placeholder={`date,description,reference,money_in,money_out,balance\n2026-05-03,KPay Settlement,REF123,40950,0,158000\n2026-05-04,HSBC Bank Charges,,0,150,157850`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Columns: date (YYYY-MM-DD), description, reference, money_in, money_out, balance. A signed-amount column also works (negative = out).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !bankAccountId}>{saving ? "Importing…" : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
