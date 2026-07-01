import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBankModule, type BankTxn } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Search, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

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

function isSystemUnconfirmed(t: BankTxn) {
  return txnSource(t) === "system" && !SETTLED.has(t.status);
}

function StatusBadge({ t }: { t: BankTxn }) {
  if (isSystemUnconfirmed(t)) {
    return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300">Unconfirmed</span>;
  }
  const s = t.status || "imported";
  const map: Record<string, string> = {
    unmatched: "bg-amber-500/15 text-amber-300",
    imported: "bg-muted text-muted-foreground",
    classified: "bg-sky-500/15 text-sky-300",
    matched: "bg-emerald-500/15 text-emerald-300",
    cleared: "bg-emerald-500/25 text-emerald-200",
    split: "bg-purple-500/15 text-purple-300",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map[s] || "bg-muted text-muted-foreground"}`}>
      {s}
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

export default function BankTransactionsPage() {
  const navigate = useNavigate();
  const { accounts, transactions, coa, updateTxn, createManualTxn, tenantId } = useBankModule();

  const [q, setQ] = useState("");
  const [acctFilter, setAcctFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [adding, setAdding] = useState(false);
  const [newTxn, setNewTxn] = useState({ ...DEFAULT_NEW });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeCoa = useMemo(() => coa, [coa]);
  const acctById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const coaById = useMemo(() => new Map(coa.map((c) => [c.id, c])), [coa]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => t.status && set.add(t.status));
    return Array.from(set).sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (acctFilter !== "all" && t.bank_account_id !== acctFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (sourceFilter !== "all" && txnSource(t) !== sourceFilter) return false;
      if (dateFrom && t.txn_date < dateFrom) return false;
      if (dateTo && t.txn_date > dateTo) return false;
      if (q) {
        const s = q.toLowerCase();
        if (
          !(t.description || "").toLowerCase().includes(s) &&
          !(t.reference || "").toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [transactions, q, acctFilter, sourceFilter, statusFilter, dateFrom, dateTo]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      inflow: filtered.reduce((s, t) => s + Number(t.money_in || 0), 0),
      outflow: filtered.reduce((s, t) => s + Number(t.money_out || 0), 0),
      unmatched: filtered.filter(
        (t) => !t.matched_record_id && ["unmatched", "pending", "imported"].includes(t.status),
      ).length,
    }),
    [filtered],
  );

  const filtersActive =
    !!q || acctFilter !== "all" || sourceFilter !== "all" || statusFilter !== "all" || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setQ("");
    setAcctFilter("all");
    setSourceFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const handleSaveManual = async () => {
    if (!newTxn.bank_account_id) return toast.error("Account required");
    if (!newTxn.txn_date) return toast.error("Date required");
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

  const patchField = async (id: string, patch: Partial<BankTxn>) => {
    try {
      await updateTxn(id, patch);
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  const acceptSuggested = async (t: BankTxn) => {
    const s = (t.suggested_category || "").trim();
    if (!s) return;
    const match =
      coa.find((c) => c.code === s) ||
      coa.find((c) => c.name.toLowerCase() === s.toLowerCase()) ||
      coa.find((c) => c.name.toLowerCase().includes(s.toLowerCase()));
    if (!match) return toast.error("Could not resolve suggested category to a GL account");
    await patchField(t.id, { category_account_id: match.id, status: "classified" });
  };

  return (
    <BankPageShell
      title="Transactions"
      description="Complete ledger across all accounts."
      actions={
        <>
          <Button size="sm" onClick={() => navigate("/bank/reconciliation")}>
            <Upload className="h-4 w-4 mr-1" /> Upload statement
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNewTxn({ ...DEFAULT_NEW, txn_date: new Date().toISOString().slice(0, 10) });
              setAdding(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add manual
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Showing" value={`${totals.count} transactions`} />
        <BankKpi label="Inflow" value={fmtMoney(totals.inflow)} tone="success" />
        <BankKpi label="Outflow" value={fmtMoney(totals.outflow)} tone="danger" />
        <BankKpi label="Unmatched" value={totals.unmatched} tone={totals.unmatched > 0 ? "warn" : "default"} />
      </div>

      <div className="card-glass rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 w-64"
            placeholder="Search description / reference"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={acctFilter} onValueChange={setAcctFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="statement">Statement</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" className="w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" className="w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      <div className="card-glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Account</th>
              <th className="text-left px-3 py-2 font-medium">Description</th>
              <th className="text-left px-3 py-2 font-medium">Source</th>
              <th className="text-right px-3 py-2 font-medium">In</th>
              <th className="text-right px-3 py-2 font-medium">Out</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">GL Account</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((t, i) => {
              const unmatchedRow =
                !t.matched_record_id && ["unmatched", "pending", "imported"].includes(t.status);
              const sysUnc = isSystemUnconfirmed(t);
              const cleared = t.status === "cleared";
              const borderClass = sysUnc || unmatchedRow
                ? "border-l-2 border-amber-400 rounded-none"
                : cleared
                ? "border-l-2 border-emerald-500/30 rounded-none"
                : "";
              const zebra = i % 2 === 1 ? "bg-muted/30" : "";
              const glName = t.category_account_id
                ? (() => {
                    const c = coaById.get(t.category_account_id);
                    return c ? `${c.code} — ${c.name}` : "—";
                  })()
                : "";
              const expanded = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr
                    className={`cursor-pointer hover:bg-accent/40 ${zebra} ${borderClass}`}
                    onClick={() => setExpandedId(expanded ? null : t.id)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">
                      {acctById.get(t.bank_account_id)?.account_name || "—"}
                    </td>
                    <td className="px-3 py-2 max-w-[280px] truncate">{t.description}</td>
                    <td className="px-3 py-2"><SourceBadge t={t} /></td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-emerald-400">
                      {Number(t.money_in) > 0 ? fmtMoney(t.money_in, "") : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-red-400">
                      {Number(t.money_out) > 0 ? fmtMoney(t.money_out, "") : ""}
                    </td>
                    <td className="px-3 py-2"><StatusBadge t={t} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                      {glName}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className={zebra}>
                      <td colSpan={8} className="px-4 py-4 bg-muted/20 border-t border-border/40">
                        <ExpandedPanel
                          t={t}
                          coa={activeCoa}
                          onAccept={() => acceptSuggested(t)}
                          onCategoryChange={(id) => patchField(t.id, { category_account_id: id })}
                          onNotesBlur={(notes) => {
                            if ((t.notes || "") !== notes) patchField(t.id, { notes });
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-8">
                  No transactions match the filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add manual dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add manual transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Account *">
              <Select
                value={newTxn.bank_account_id}
                onValueChange={(v) => setNewTxn({ ...newTxn, bank_account_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date *">
                <Input type="date" value={newTxn.txn_date} onChange={(e) => setNewTxn({ ...newTxn, txn_date: e.target.value })} />
              </Field>
              <Field label="Reference">
                <Input value={newTxn.reference} onChange={(e) => setNewTxn({ ...newTxn, reference: e.target.value })} />
              </Field>
            </div>
            <Field label="Description *">
              <Input value={newTxn.description} onChange={(e) => setNewTxn({ ...newTxn, description: e.target.value })} />
            </Field>
            <Field label="Direction *">
              <RadioGroup
                value={newTxn.direction}
                onValueChange={(v) => setNewTxn({ ...newTxn, direction: v as "in" | "out" })}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="in" /> Money in
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="out" /> Money out
                </label>
              </RadioGroup>
            </Field>
            <Field label="Amount *">
              <Input
                type="number"
                step="0.01"
                value={newTxn.amount || ""}
                onChange={(e) => setNewTxn({ ...newTxn, amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="GL Account">
              <Select
                value={newTxn.category_account_id}
                onValueChange={(v) => setNewTxn({ ...newTxn, category_account_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {activeCoa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea value={newTxn.notes} onChange={(e) => setNewTxn({ ...newTxn, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={handleSaveManual}>Add transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function ExpandedPanel({
  t,
  coa,
  onAccept,
  onCategoryChange,
  onNotesBlur,
}: {
  t: BankTxn;
  coa: Array<{ id: string; code: string; name: string }>;
  onAccept: () => void;
  onCategoryChange: (id: string) => void;
  onNotesBlur: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(t.notes || "");
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
      <div className="space-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Value date</div>
          <div className="font-mono">{fmtDate(t.value_date || t.txn_date)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Currency</div>
          <div className="font-mono">{t.currency || "—"}</div>
        </div>
        {t.match_confidence && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</div>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted">
              {t.match_confidence}
            </span>
          </div>
        )}
        {t.matched_record_id && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Matched</div>
            <div className="text-xs">
              {t.matched_record_type} · {t.matched_record_id.slice(0, 8)}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2 md:col-span-2">
        {t.suggested_category && (
          <div className="flex items-center gap-2 rounded-md border border-border/60 p-2">
            <div className="text-xs">
              <span className="text-muted-foreground">Suggested category: </span>
              <span className="font-medium">{t.suggested_category}</span>
            </div>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={onAccept}>
              Accept
            </Button>
          </div>
        )}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">GL Account</Label>
          <Select value={t.category_account_id || ""} onValueChange={onCategoryChange}>
            <SelectTrigger><SelectValue placeholder="Select GL account" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {coa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onNotesBlur(notes)}
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
