import { useMemo, useState } from "react";
import { useBankModule, type BankTxn } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Plus, AlertTriangle } from "lucide-react";
import { StatementUploadFlow } from "@/components/bank/recon/StatementUploadFlow";
import { TransactionReviewPanel } from "@/components/bank/recon/TransactionReviewPanel";
import { FilteredTxnList } from "@/components/bank/recon/FilteredTxnList";

const SETTLED = new Set(["matched", "cleared", "approved", "posted"]);

function txnSource(t: BankTxn): "manual" | "system" | "statement" {
  const src = (t as any).source as string | null | undefined;
  if (src === "manual" || (!src && t.is_manual === true)) return "manual";
  if (src === "system") return "system";
  return "statement";
}

function SourceBadge({ t }: { t: BankTxn }) {
  const s = txnSource(t);
  const cls =
    s === "manual"
      ? "bg-purple-500/15 text-purple-300"
      : s === "system"
      ? "bg-teal-500/15 text-teal-300"
      : "bg-sky-500/15 text-sky-300";
  const label = s === "manual" ? "Manual" : s === "system" ? "System" : "Statement";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

const DEFAULT_NEW = {
  bank_account_id: "",
  txn_date: new Date().toISOString().slice(0, 10),
  description: "",
  reference: "",
  direction: "in" as "in" | "out",
  amount: 0,
  notes: "",
  category_account_id: "",
};

export default function BankReconciliationPage() {
  const {
    tenantId, accounts, transactions, imports, coa, reconRules,
    statementBalanceFor, currentBalanceFor, updateTxn, createManualTxn, reload,
  } = useBankModule();

  const [acctId, setAcctId] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>("");
  const [tab, setTab] = useState<string>("overview");
  const [reviewTxn, setReviewTxn] = useState<BankTxn | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTxn, setNewTxn] = useState({ ...DEFAULT_NEW });
  const [inlineGlFor, setInlineGlFor] = useState<string | null>(null);

  const currentAcct = accounts.find((a) => a.id === acctId);
  const periods = useMemo(
    () => imports.filter((i) => i.bank_account_id === acctId).sort((a, b) => (a.period_end < b.period_end ? 1 : -1)),
    [imports, acctId],
  );
  const period = periods.find((p) => p.id === periodId) || periods[0];

  const periodTxns = useMemo(() => {
    if (!acctId) return [];
    if (!period) return transactions.filter((t) => t.bank_account_id === acctId);
    return transactions.filter(
      (t) => t.bank_account_id === acctId && t.txn_date >= period.period_start && t.txn_date <= period.period_end,
    );
  }, [transactions, acctId, period]);

  const reconciled = useMemo(() => periodTxns.filter((t) => SETTLED.has(t.status)), [periodTxns]);
  const outstanding = useMemo(() => periodTxns.filter((t) => !SETTLED.has(t.status)), [periodTxns]);
  const progressPct = periodTxns.length ? (reconciled.length / periodTxns.length) * 100 : 0;

  const stmtBal = acctId ? statementBalanceFor(acctId) : 0;
  const sysBal = acctId ? currentBalanceFor(acctId) : 0;
  const diff = stmtBal - sysBal;
  const diffZero = Math.abs(diff) < 0.01;

  // Exceptions
  const exceptions = useMemo(() => {
    return periodTxns
      .map((t) => {
        if (!t.category_account_id && !t.matched_record_id) {
          return { t, issue: "No GL account" as const };
        }
        if (txnSource(t) === "system" && !["matched", "cleared"].includes(t.status)) {
          return { t, issue: "Unconfirmed system transaction" as const };
        }
        if (t.match_confidence === "low") {
          return { t, issue: "Low confidence" as const };
        }
        return null;
      })
      .filter((x): x is { t: BankTxn; issue: "No GL account" | "Unconfirmed system transaction" | "Low confidence" } => !!x);
  }, [periodTxns]);

  const totalIn = periodTxns.reduce((s, t) => s + Number(t.money_in || 0), 0);
  const totalOut = periodTxns.reduce((s, t) => s + Number(t.money_out || 0), 0);

  const handleAddManual = async () => {
    if (!newTxn.bank_account_id) return toast.error("Account required");
    if (!newTxn.description) return toast.error("Description required");
    if (!Number(newTxn.amount)) return toast.error("Amount required");
    try {
      await createManualTxn({
        bank_account_id: newTxn.bank_account_id,
        txn_date: newTxn.txn_date,
        description: newTxn.description,
        reference: newTxn.reference,
        money_in: newTxn.direction === "in" ? Number(newTxn.amount) : 0,
        money_out: newTxn.direction === "out" ? Number(newTxn.amount) : 0,
        notes: newTxn.notes,
        category_account_id: newTxn.category_account_id || null,
        status: "imported",
        ...({ source: "manual" } as any),
        is_manual: true,
        tenant_id: tenantId,
      } as any);
      toast.success("Manual transaction added");
      setAdding(false);
      setNewTxn({ ...DEFAULT_NEW });
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    }
  };

  const acceptAllHigh = async () => {
    const targets = periodTxns.filter((t) => t.match_confidence === "high" && t.status !== "matched");
    if (!targets.length) return toast.info("No high-confidence items to accept");
    try {
      for (const t of targets) await updateTxn(t.id, { status: "matched" });
      toast.success(`Accepted ${targets.length} matches`);
    } catch (e: any) { toast.error(e.message); }
  };
  const flagAllLow = async () => {
    const targets = periodTxns.filter((t) => t.match_confidence === "low");
    if (!targets.length) return toast.info("No low-confidence items to flag");
    try {
      for (const t of targets) await updateTxn(t.id, { status: "needs_review" });
      toast.success(`Flagged ${targets.length} items`);
    } catch (e: any) { toast.error(e.message); }
  };

  const closePeriod = async () => {
    if (!period || !acctId) return;
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from("bank_reconciliation_periods" as any).insert({
        bank_account_id: acctId,
        period_start: period.period_start,
        period_end: period.period_end,
        statement_balance: stmtBal,
        ledger_balance: sysBal,
        difference: diff,
        status: "closed",
        locked_by: uid,
        locked_at: new Date().toISOString(),
        tenant_id: tenantId,
      } as any);
      if (error) throw error;
      const toClear = periodTxns.filter((t) => ["matched", "approved", "posted"].includes(t.status));
      for (const t of toClear) await updateTxn(t.id, { status: "cleared" });
      await reload();
      toast.success("Period closed and locked.");
      setTab("overview");
    } catch (e: any) {
      toast.error(e.message || "Close failed");
    }
  };

  return (
    <BankPageShell
      title="Reconciliation"
      description="Upload statements, match transactions, and close periods."
      actions={
        <>
          <Select value={acctId} onValueChange={(v) => { setAcctId(v); setPeriodId(""); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={periodId || (period?.id || "")} onValueChange={setPeriodId} disabled={!acctId}>
            <SelectTrigger className="w-64"><SelectValue placeholder={periods.length ? "Period" : "No imports yet"} /></SelectTrigger>
            <SelectContent>
              {periods.length ? periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                </SelectItem>
              )) : <SelectItem disabled value="none">No imports yet</SelectItem>}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setTab("upload")} disabled={!acctId}>
            <Upload className="h-4 w-4 mr-1" /> Upload statement
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            setNewTxn({ ...DEFAULT_NEW, bank_account_id: acctId, txn_date: new Date().toISOString().slice(0, 10) });
            setAdding(true);
          }} disabled={!acctId}>
            <Plus className="h-4 w-4 mr-1" /> Add manual transaction
          </Button>
        </>
      }
    >
      {!acctId ? (
        <div className="card-glass rounded-xl p-16 flex flex-col items-center justify-center gap-4">
          <div className="text-sm text-muted-foreground">Select an account to begin reconciliation</div>
          {accounts[0] && (
            <Button size="sm" onClick={() => setAcctId(accounts[0].id)}>Use {accounts[0].account_name}</Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <BankKpi label="Statement balance" value={fmtMoney(stmtBal, currentAcct?.currency)} />
            <BankKpi label="System balance" value={fmtMoney(sysBal, currentAcct?.currency)} />
            <BankKpi label="Difference" value={fmtMoney(diff, currentAcct?.currency)} tone={diffZero ? "success" : "warn"} />
            <BankKpi label="Reconciled this period" value={reconciled.length} tone="success" />
            <BankKpi label="Outstanding" value={outstanding.length} tone={outstanding.length ? "warn" : "default"} />
          </div>

          <div className="card-glass rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {Math.round(progressPct)}% reconciled · {outstanding.length} item{outstanding.length === 1 ? "" : "s"} remaining
              </span>
              <span className="text-muted-foreground font-mono">{reconciled.length}/{periodTxns.length}</span>
            </div>
            <Progress value={progressPct} className="h-2 [&>div]:bg-emerald-500" />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-transparent border-b border-border/60 rounded-none w-full justify-start gap-6 p-0 h-auto">
              {[
                { v: "overview", l: "Overview" },
                { v: "upload", l: "Upload" },
                { v: "review", l: "Review" },
                { v: "exceptions", l: `Exceptions${exceptions.length ? ` (${exceptions.length})` : ""}` },
                { v: "close", l: "Close period" },
              ].map((x) => (
                <TabsTrigger
                  key={x.v}
                  value={x.v}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-400 data-[state=active]:text-amber-300 data-[state=active]:bg-transparent px-1 pb-2 text-sm"
                >
                  {x.l}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryBox label="Opening balance" value={fmtMoney(period?.opening_balance ?? 0, currentAcct?.currency)} />
                <SummaryBox label="Total in" value={fmtMoney(totalIn, currentAcct?.currency)} tone="emerald" />
                <SummaryBox label="Total out" value={fmtMoney(totalOut, currentAcct?.currency)} tone="red" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card-glass rounded-xl p-4">
                  <div className="font-semibold text-sm text-emerald-400 mb-3">
                    Reconciled · {reconciled.length}
                  </div>
                  <TxnMiniList txns={reconciled} onOpen={setReviewTxn} borderClass="border-emerald-500/30" />
                </div>
                <div className="card-glass rounded-xl p-4">
                  <div className="font-semibold text-sm text-amber-300 mb-3">
                    Outstanding · {outstanding.length}
                  </div>
                  <TxnMiniList txns={outstanding} onOpen={setReviewTxn} borderClass="border-amber-400" />
                </div>
              </div>
            </TabsContent>

            {/* UPLOAD */}
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="card-glass rounded-xl p-4">
                <StatementUploadFlow
                  open={true}
                  onClose={() => {}}
                  onCommitted={reload}
                  accounts={accounts}
                  reload={reload}
                  tenantId={tenantId}
                />
              </div>
              <div className="card-glass rounded-xl p-4">
                <div className="font-semibold text-sm mb-3">Previous imports</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                      <th className="text-left px-3 py-2 font-medium">Period</th>
                      <th className="text-left px-3 py-2 font-medium">File name</th>
                      <th className="text-right px-3 py-2 font-medium">Transactions</th>
                      <th className="text-left px-3 py-2 font-medium">Uploaded</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p, i) => {
                      const count = transactions.filter((t) => t.import_id === p.id).length;
                      return (
                        <tr key={p.id} className={i % 2 === 1 ? "bg-muted/30" : ""}>
                          <td className="px-3 py-2">{fmtDate(p.period_start)} → {fmtDate(p.period_end)}</td>
                          <td className="px-3 py-2 truncate max-w-[280px]">{p.file_name || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono">{count}</td>
                          <td className="px-3 py-2">{fmtDate(p.uploaded_at)}</td>
                          <td className="px-3 py-2"><ImportStatusBadge status={p.status} /></td>
                        </tr>
                      );
                    })}
                    {!periods.length && (
                      <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No imports yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* REVIEW */}
            <TabsContent value="review" className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10" onClick={acceptAllHigh}>
                  Accept all high confidence
                </Button>
                <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10" onClick={flagAllLow}>
                  Flag all low confidence
                </Button>
              </div>
              <div className="card-glass rounded-xl p-4">
                <FilteredTxnList
                  title={`Transactions · ${period ? `${fmtDate(period.period_start)} → ${fmtDate(period.period_end)}` : "all"}`}
                  emptyMessage="No transactions in this period"
                  txns={periodTxns}
                  accounts={accounts}
                  onOpen={setReviewTxn}
                />
              </div>
            </TabsContent>

            {/* EXCEPTIONS */}
            <TabsContent value="exceptions" className="space-y-4 mt-4">
              <div className="card-glass rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                      <th className="text-left px-3 py-2 font-medium">Issue</th>
                      <th className="text-left px-3 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map(({ t, issue }, i) => {
                      const amt = Number(t.money_in || 0) - Number(t.money_out || 0);
                      return (
                        <tr key={t.id} className={i % 2 === 1 ? "bg-muted/30" : ""}>
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                          <td className="px-3 py-2 max-w-[300px] truncate">{t.description}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-mono ${amt >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtMoney(Math.abs(amt), "")}
                          </td>
                          <td className="px-3 py-2 text-xs">{issue}</td>
                          <td className="px-3 py-2">
                            {issue === "No GL account" ? (
                              inlineGlFor === t.id ? (
                                <Select
                                  onValueChange={async (v) => {
                                    try {
                                      await updateTxn(t.id, { category_account_id: v });
                                      toast.success("GL account assigned");
                                      setInlineGlFor(null);
                                    } catch (e: any) { toast.error(e.message); }
                                  }}
                                >
                                  <SelectTrigger className="w-56 h-8"><SelectValue placeholder="Select GL" /></SelectTrigger>
                                  <SelectContent className="max-h-72">
                                    {coa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => setInlineGlFor(t.id)}>Assign account</Button>
                              )
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setReviewTxn(t)}>
                                {issue === "Unconfirmed system transaction" ? "Match to statement" : "Review"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!exceptions.length && (
                      <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No exceptions in this period 🎉</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-xs px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Resolve all exceptions before closing the period.
              </div>
            </TabsContent>

            {/* CLOSE */}
            <TabsContent value="close" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryBox label="Statement balance" value={fmtMoney(stmtBal, currentAcct?.currency)} />
                <SummaryBox label="System balance" value={fmtMoney(sysBal, currentAcct?.currency)} />
                <SummaryBox label="Difference" value={fmtMoney(diff, currentAcct?.currency)} tone={diffZero ? "emerald" : "amber"} />
              </div>

              {exceptions.length > 0 ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-center justify-between">
                  <div className="text-sm text-red-300">
                    Cannot close — {exceptions.length} exception{exceptions.length === 1 ? "" : "s"} remain. Go to Exceptions tab to resolve them.
                  </div>
                  <Button size="sm" variant="outline" className="border-red-500/50 text-red-300" onClick={() => setTab("exceptions")}>
                    Go to exceptions
                  </Button>
                </div>
              ) : !diffZero ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm text-amber-300">
                    {fmtMoney(Math.abs(diff), currentAcct?.currency)} difference remains. You may close with a noted difference or continue investigating.
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10" onClick={closePeriod}>
                      Close with noted difference
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setTab("exceptions")}>Go to exceptions</Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center justify-between">
                  <div className="text-sm text-emerald-300">All transactions reconciled. Ready to close.</div>
                  <Button size="sm" onClick={closePeriod}>Close and lock period</Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Review sheet */}
      <Sheet open={!!reviewTxn} onOpenChange={(o) => !o && setReviewTxn(null)}>
        <SheetContent className="sm:max-w-xl">
          <TransactionReviewPanel
            txn={reviewTxn}
            accounts={accounts}
            userRules={[]}
            reconRules={reconRules as any}
            onClose={() => setReviewTxn(null)}
            onChanged={reload}
          />
        </SheetContent>
      </Sheet>

      {/* Manual dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add manual transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Account *">
              <Select value={newTxn.bank_account_id} onValueChange={(v) => setNewTxn({ ...newTxn, bank_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date *"><Input type="date" value={newTxn.txn_date} onChange={(e) => setNewTxn({ ...newTxn, txn_date: e.target.value })} /></Field>
              <Field label="Reference"><Input value={newTxn.reference} onChange={(e) => setNewTxn({ ...newTxn, reference: e.target.value })} /></Field>
            </div>
            <Field label="Description *"><Input value={newTxn.description} onChange={(e) => setNewTxn({ ...newTxn, description: e.target.value })} /></Field>
            <Field label="Direction *">
              <RadioGroup value={newTxn.direction} onValueChange={(v) => setNewTxn({ ...newTxn, direction: v as "in" | "out" })} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="in" /> Money in</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="out" /> Money out</label>
              </RadioGroup>
            </Field>
            <Field label="Amount *"><Input type="number" step="0.01" value={newTxn.amount || ""} onChange={(e) => setNewTxn({ ...newTxn, amount: Number(e.target.value) })} /></Field>
            <Field label="GL Account">
              <Select value={newTxn.category_account_id} onValueChange={(v) => setNewTxn({ ...newTxn, category_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {coa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes"><Textarea value={newTxn.notes} onChange={(e) => setNewTxn({ ...newTxn, notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={handleAddManual}>Add transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BankPageShell>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-300" : "";
  return (
    <div className="card-glass rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-mono font-semibold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function TxnMiniList({ txns, onOpen, borderClass }: { txns: BankTxn[]; onOpen: (t: BankTxn) => void; borderClass: string }) {
  if (!txns.length) return <div className="text-xs text-muted-foreground py-6 text-center">Nothing to show</div>;
  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {txns.slice(0, 80).map((t) => {
        const amt = Number(t.money_in || 0) - Number(t.money_out || 0);
        return (
          <button
            key={t.id}
            onClick={() => onOpen(t)}
            className={`w-full text-left border-l-2 rounded-none ${borderClass} bg-muted/20 hover:bg-muted/40 px-3 py-1.5 flex items-center gap-2 text-xs`}
          >
            <span className="text-muted-foreground w-20 shrink-0">{fmtDate(t.txn_date)}</span>
            <span className="flex-1 truncate">{t.description}</span>
            <SourceBadge t={t} />
            <span className={`w-24 text-right tabular-nums font-mono ${amt >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmtMoney(Math.abs(amt), "")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ImportStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    reconciled: "bg-emerald-500/15 text-emerald-300",
    in_progress: "bg-amber-500/15 text-amber-300",
    pending: "bg-muted text-muted-foreground",
  };
  const label = status === "reconciled" ? "Closed" : status === "in_progress" ? "In progress" : status === "pending" ? "Pending" : status;
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map[status] || "bg-muted text-muted-foreground"}`}>{label}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
