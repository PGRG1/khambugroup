import { useMemo, useState } from "react";
import { useBankModule, type BankTxn } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Split as SplitIcon, Check } from "lucide-react";
import { toast } from "sonner";

export default function BankTransactionsPage() {
  const {
    accounts, transactions, coa,
    updateTxn, createManualTxn, splitTxn, classify,
  } = useBankModule();
  const [q, setQ] = useState("");
  const [acctFilter, setAcctFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [edit, setEdit] = useState<BankTxn | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTxn, setNewTxn] = useState<Partial<BankTxn>>({});
  const [splits, setSplits] = useState<Array<{ description: string; money_in: number; money_out: number; category_account_id?: string | null }>>([]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (acctFilter !== "all" && t.bank_account_id !== acctFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !((t.description || "").toLowerCase().includes(q.toLowerCase()) ||
                 (t.reference || "").toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [transactions, q, acctFilter, statusFilter]);

  const totals = useMemo(() => ({
    inflow: filtered.reduce((s, t) => s + Number(t.money_in || 0), 0),
    outflow: filtered.reduce((s, t) => s + Number(t.money_out || 0), 0),
    matched: filtered.filter((t) => t.matched_record_id).length,
    unmatched: filtered.filter((t) => !t.matched_record_id).length,
  }), [filtered]);

  const saveEdit = async () => {
    if (!edit) return;
    try {
      await updateTxn(edit.id, {
        notes: edit.notes,
        category_account_id: edit.category_account_id,
        status: edit.status,
      });
      toast.success("Updated");
      setEdit(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const acctName = (id: string) => accounts.find((a) => a.id === id)?.account_name || "—";
  const acctCcy = (id: string) => accounts.find((a) => a.id === id)?.currency || "HKD";

  return (
    <BankPageShell
      title="Transactions"
      description="Complete bank transaction ledger across all accounts."
      actions={
        <Button size="sm" onClick={() => { setNewTxn({ txn_date: new Date().toISOString().slice(0, 10), money_in: 0, money_out: 0 }); setAdding(true); }}>
          <Plus className="h-4 w-4 mr-1" />Manual transaction
        </Button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Filtered txns" value={filtered.length} />
        <BankKpi label="Inflow" value={fmtMoney(totals.inflow)} tone="success" />
        <BankKpi label="Outflow" value={fmtMoney(totals.outflow)} tone="danger" />
        <BankKpi label="Matched / Unmatched" value={`${totals.matched} / ${totals.unmatched}`} />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7 w-64" placeholder="Search description / reference" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={acctFilter} onValueChange={setAcctFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {["all","imported","classified","matched","split","approved","posted","unmatched","pending"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>CCY</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead>Suggested</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 500).map((t) => {
              const cls = classify(t);
              return (
                <TableRow key={t.id} className="cursor-pointer hover:bg-accent/40" onClick={() => { setEdit(t); setSplits([]); }}>
                  <TableCell>{fmtDate(t.txn_date)}</TableCell>
                  <TableCell>{fmtDate(t.value_date || t.txn_date)}</TableCell>
                  <TableCell className="truncate max-w-[160px]">{acctName(t.bank_account_id)}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{t.description}</TableCell>
                  <TableCell>{t.currency || acctCcy(t.bank_account_id)}</TableCell>
                  <TableCell className="text-right font-mono td-num text-emerald-600">{t.money_in ? fmtMoney(t.money_in, "") : ""}</TableCell>
                  <TableCell className="text-right font-mono td-num text-rose-600">{t.money_out ? fmtMoney(t.money_out, "") : ""}</TableCell>
                  <TableCell>{cls?.suggested_type ? <Badge variant="secondary">{cls.suggested_type}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{t.match_confidence ? <Badge variant="outline">{t.match_confidence}</Badge> : ""}</TableCell>
                  <TableCell><Badge variant={t.matched_record_id ? "default" : "outline"}>{t.status || "imported"}</Badge></TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No transactions match the filters</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit / split sheet */}
      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader><SheetTitle>Transaction details</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 py-4">
              <div className="text-sm text-muted-foreground">{fmtDate(edit.txn_date)} · {acctName(edit.bank_account_id)}</div>
              <div className="font-medium">{edit.description}</div>
              <div className="flex gap-4 text-sm">
                {edit.money_in ? <span className="text-emerald-600">+{fmtMoney(edit.money_in)}</span> : null}
                {edit.money_out ? <span className="text-rose-600">−{fmtMoney(edit.money_out)}</span> : null}
              </div>
              <Field label="Category (GL account)">
                <Select value={edit.category_account_id || ""} onValueChange={(v) => setEdit({ ...edit, category_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {coa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["imported","classified","matched","approved","posted","unmatched"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes">
                <Textarea value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </Field>

              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm flex items-center gap-1"><SplitIcon className="h-3.5 w-3.5" /> Split into</div>
                  <Button size="sm" variant="outline" onClick={() => setSplits([...splits, { description: "", money_in: 0, money_out: 0 }])}>+ Add line</Button>
                </div>
                {splits.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1">
                    <Input className="col-span-5" placeholder="Description" value={s.description} onChange={(e) => { const c = [...splits]; c[i].description = e.target.value; setSplits(c); }} />
                    <Input className="col-span-2" type="number" placeholder="In" value={s.money_in || ""} onChange={(e) => { const c = [...splits]; c[i].money_in = Number(e.target.value); setSplits(c); }} />
                    <Input className="col-span-2" type="number" placeholder="Out" value={s.money_out || ""} onChange={(e) => { const c = [...splits]; c[i].money_out = Number(e.target.value); setSplits(c); }} />
                    <Select value={s.category_account_id || ""} onValueChange={(v) => { const c = [...splits]; c[i].category_account_id = v; setSplits(c); }}>
                      <SelectTrigger className="col-span-3"><SelectValue placeholder="Cat" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {coa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {splits.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={async () => {
                    if (!edit) return;
                    try { await splitTxn(edit.id, splits); toast.success("Split"); setEdit(null); setSplits([]); }
                    catch (e: any) { toast.error(e.message); }
                  }}>Save split</Button>
                )}
              </div>
            </div>
          )}
          <SheetFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Close</Button>
            {edit && <Button onClick={saveEdit}><Check className="h-4 w-4 mr-1" />Save</Button>}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Manual transaction sheet */}
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Manual transaction</SheetTitle></SheetHeader>
          <div className="space-y-3 py-4">
            <Field label="Bank account">
              <Select value={newTxn.bank_account_id || ""} onValueChange={(v) => setNewTxn({ ...newTxn, bank_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <Input type="date" value={newTxn.txn_date || ""} onChange={(e) => setNewTxn({ ...newTxn, txn_date: e.target.value })} />
              </Field>
              <Field label="Reference">
                <Input value={newTxn.reference || ""} onChange={(e) => setNewTxn({ ...newTxn, reference: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <Input value={newTxn.description || ""} onChange={(e) => setNewTxn({ ...newTxn, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Money in">
                <Input type="number" step="0.01" value={newTxn.money_in ?? 0} onChange={(e) => setNewTxn({ ...newTxn, money_in: Number(e.target.value) })} />
              </Field>
              <Field label="Money out">
                <Input type="number" step="0.01" value={newTxn.money_out ?? 0} onChange={(e) => setNewTxn({ ...newTxn, money_out: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={newTxn.notes || ""} onChange={(e) => setNewTxn({ ...newTxn, notes: e.target.value })} />
            </Field>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!newTxn.bank_account_id || !newTxn.txn_date || !newTxn.description) { toast.error("Account, date, description required"); return; }
              try { await createManualTxn(newTxn); toast.success("Added"); setAdding(false); }
              catch (e: any) { toast.error(e.message); }
            }}>Create</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </BankPageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
