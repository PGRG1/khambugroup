import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wallet, ExternalLink, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader, KpiCard, KpiGrid, StatusPill, fmtHK, fmtHKWhole, fmtDate,
} from "@/components/expenses/shared";
import {
  useStaffReimbursements, type StaffReimbursement,
} from "@/hooks/useStaffReimbursements";
import ReimbursementAiImport from "@/components/staff-reimbursements/ReimbursementAiImport";

type StatusFilter = "all" | "owing" | "paid";

export default function StaffReimbursements() {
  const sr = useStaffReimbursements();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<StaffReimbursement | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sr.reimbursements.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.claimant_name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    });
  }, [sr.reimbursements, statusFilter, search]);

  const categoriesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of sr.classifications) m.set(c.id, c.name);
    return m;
  }, [sr.classifications]);

  const paidFromLabel = (r: StaffReimbursement): string => {
    if (r.status !== "paid" || !r.paid_from) return "—";
    if (r.paid_from === "bank") {
      const b = sr.bankAccounts.find(x => x.id === r.paid_from_bank_account_id);
      return b ? `Bank · ${b.account_name}` : "Bank";
    }
    if (r.paid_from === "petty_cash") {
      const f = sr.floats.find(x => x.id === r.paid_from_float_id);
      return f ? `Petty Cash · ${f.name}` : "Petty Cash";
    }
    if (r.paid_from === "payroll") return "Payroll";
    return "—";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Finance"
        title="Staff Reimbursements"
        description="Money the business owes employees for work-related expenses they paid out of pocket."
        actions={
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Claim
          </Button>
        }
      />

      {sr.loading ? (
        <KpiGrid>
          {[0, 1].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            label="Total Owing"
            value={fmtHKWhole(sr.totalOwing)}
            tone={sr.totalOwing > 0 ? "warning" : "default"}
            hint={`${sr.reimbursements.filter(r => r.status === "owing").length} open claim(s)`}
          />
          <KpiCard
            label="Paid This Month"
            value={fmtHKWhole(sr.paidThisMonth)}
            tone="success"
          />
        </KpiGrid>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "owing", "paid"] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={
                "px-3 h-8 rounded-full text-xs font-medium capitalize border transition-colors " +
                (statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border/60 hover:text-foreground hover:border-border")
              }
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search claimant, description, amount…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="card-glass overflow-hidden">
        {sr.loading ? (
          <div className="p-6 space-y-2">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
            <div className="text-sm font-medium">No claims yet</div>
            <p className="text-xs text-muted-foreground mt-1">
              Record a claim when an employee has paid for a work expense from their own pocket.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border/60">
                  <th className="text-left font-medium px-4 py-2.5">Claimant</th>
                  <th className="text-left font-medium px-4 py-2.5">Description</th>
                  <th className="text-left font-medium px-4 py-2.5">Category</th>
                  <th className="text-right font-medium px-4 py-2.5">Amount</th>
                  <th className="text-left font-medium px-4 py-2.5">Date</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Paid From</th>
                  <th className="text-right font-medium px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.claimant_name}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="truncate" title={r.description}>{r.description}</div>
                      {r.receipt_url && (
                        <a
                          href={r.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary mt-0.5 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> receipt
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {categoriesById.get(r.category_id) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right td-num tabular-nums">{fmtHK(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.claim_date)}</td>
                    <td className="px-4 py-3">
                      <StatusPill variant={r.status === "paid" ? "success" : "warning"}>
                        {r.status === "paid" ? "Paid" : "Owing"}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{paidFromLabel(r)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "owing" && (
                        <Button size="sm" variant="outline" onClick={() => setPayOpen(r)}>
                          Mark as Paid
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddClaimDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        sr={sr}
      />
      <MarkPaidDialog
        claim={payOpen}
        onOpenChange={(o) => { if (!o) setPayOpen(null); }}
        sr={sr}
      />
    </div>
  );
}

/* ------------------------------------------------------------- */
/* Add Claim dialog                                              */
/* ------------------------------------------------------------- */
function AddClaimDialog({
  open, onOpenChange, sr,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sr: ReturnType<typeof useStaffReimbursements>;
}) {
  const [claimant, setClaimant] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setClaimant(""); setDescription(""); setCategoryId("");
    setAmount(""); setDate(new Date().toISOString().slice(0, 10)); setFile(null);
  };

  const canSubmit =
    claimant.trim() && description.trim() && categoryId &&
    amount && Number(amount) > 0 && date;

  const submit = async () => {
    if (!canSubmit || !sr.tenantId) return;
    setSaving(true);
    try {
      let receipt_url: string | null = null;
      let receipt_path: string | null = null;
      if (file) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (uid) {
          const path = `staff-reimbursements/${uid}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("petty-cash-receipts").upload(path, file);
          if (upErr) throw upErr;
          receipt_path = path;
          const { data: signed } = await supabase.storage.from("petty-cash-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
          receipt_url = signed?.signedUrl ?? null;
        }
      }

      await sr.createClaim({
        claimant_name: claimant,
        description,
        category_id: categoryId,
        amount: Number(amount),
        claim_date: date,
        receipt_url,
        receipt_path,
      });
      toast.success("Claim recorded and posted to GL");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to record claim");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Reimbursement Claim</DialogTitle>
          <DialogDescription>
            Records what an employee is owed. Posts a journal entry immediately
            (Dr expense, Cr Staff Reimbursements Payable).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Claimant name</Label>
            <Input value={claimant} onChange={e => setClaimant(e.target.value)} placeholder="e.g. Marcus Wong" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did they pay for?"
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {sr.classifications.filter(c => c.is_active).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount (HK$)</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Claim date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Receipt (optional)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Saving…" : "Record claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- */
/* Mark Paid dialog                                              */
/* ------------------------------------------------------------- */
function MarkPaidDialog({
  claim, onOpenChange, sr,
}: {
  claim: StaffReimbursement | null;
  onOpenChange: (o: boolean) => void;
  sr: ReturnType<typeof useStaffReimbursements>;
}) {
  const [paidFrom, setPaidFrom] = useState<"bank" | "petty_cash" | "payroll">("bank");
  const [bankId, setBankId] = useState<string>("");
  const [floatId, setFloatId] = useState<string>("");
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  if (!claim) return null;

  const canSubmit =
    paidDate &&
    ((paidFrom === "bank" && bankId) ||
      (paidFrom === "petty_cash" && floatId));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await sr.markAsPaid(claim, {
        paid_from: paidFrom,
        paid_date: paidDate,
        bank_account_id: paidFrom === "bank" ? bankId : null,
        float_id: paidFrom === "petty_cash" ? floatId : null,
      });
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!claim} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
          <DialogDescription>
            Settling {fmtHK(Number(claim.amount))} owed to <strong>{claim.claimant_name}</strong>.
            Posts a payment journal (Dr Payable, Cr chosen source).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Paid from</Label>
            <div className="flex gap-1.5 mt-1">
              {(["bank", "petty_cash", "payroll"] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  disabled={v === "payroll"}
                  onClick={() => setPaidFrom(v)}
                  className={
                    "flex-1 px-3 h-9 rounded-md text-xs font-medium capitalize border transition-colors " +
                    (v === "payroll" ? "opacity-40 cursor-not-allowed " : "") +
                    (paidFrom === v && v !== "payroll"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent border-border/60 hover:border-border")
                  }
                >
                  {v === "petty_cash" ? "Petty Cash" : v === "payroll" ? "Payroll (soon)" : "Bank"}
                </button>
              ))}
            </div>
          </div>

          {paidFrom === "bank" && (
            <div>
              <Label className="text-xs">Bank account</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>
                  {sr.bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {paidFrom === "petty_cash" && (
            <div>
              <Label className="text-xs">Petty cash float</Label>
              <Select value={floatId} onValueChange={setFloatId}>
                <SelectTrigger><SelectValue placeholder="Select float" /></SelectTrigger>
                <SelectContent>
                  {sr.floats.filter(f => f.is_active).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name} · {f.venue}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Payment date</Label>
            <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Saving…" : "Confirm payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
