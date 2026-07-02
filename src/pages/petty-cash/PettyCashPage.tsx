import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Sparkles, Wallet, Receipt as ReceiptIcon, RefreshCw, Upload, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/salesUtils";
import { usePettyCash, type PettyFloat, type PettyClassification, type PettyReceipt, type PettyReplenishment } from "@/hooks/usePettyCash";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "receipts", label: "Receipts" },
  { key: "replenishments", label: "Replenishments" },
  { key: "__divider__", label: "" },
  { key: "floats", label: "Floats" },
  { key: "classifications", label: "Classifications" },
] as const;

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const healthColor = (bal: number, threshold: number) => {
  if (bal <= threshold * 0.5) return "text-red-500";
  if (bal <= threshold) return "text-amber-500";
  return "text-emerald-500";
};

export default function PettyCashPage() {
  const pc = usePettyCash();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const setTab = (t: string) => (t === "overview" ? setParams({}) : setParams({ tab: t }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-display tracking-tight">Petty Cash</h1>
          <p className="text-sm text-muted-foreground">Physical cash floats, receipts and replenishments per venue.</p>
        </div>
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to Home</Link>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) =>
          t.key === "__divider__" ? (
            <span key="d" className="mx-2 h-5 w-px bg-border" />
          ) : (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm rounded-t-md transition-colors ${
                tab === t.key
                  ? "text-foreground border-b-2 border-primary -mb-px font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          )
        )}
      </div>

      {pc.loading ? (
        <Card className="card-glass p-10 text-center text-muted-foreground">Loading petty cash…</Card>
      ) : (
        <>
          {tab === "overview" && <OverviewTab pc={pc} />}
          {tab === "receipts" && <ReceiptsTab pc={pc} />}
          {tab === "replenishments" && <ReplenishmentsTab pc={pc} />}
          {tab === "floats" && <FloatsTab pc={pc} />}
          {tab === "classifications" && <ClassificationsTab pc={pc} />}
        </>
      )}
    </div>
  );
}

/* ================================================================
 * OVERVIEW
 * ================================================================ */
function OverviewTab({ pc }: { pc: ReturnType<typeof usePettyCash> }) {
  const totalFloatValue = pc.floats.reduce((s, f) => s + Number(f.float_amount || 0), 0);
  const totalOnHand = pc.floats.reduce((s, f) => s + (pc.balanceByFloat[f.id] ?? 0), 0);
  const pendingReceipts = pc.receipts.filter((r) => r.status === "pending");
  const pendingAmount = pendingReceipts.reduce((s, r) => s + Number(r.amount), 0);
  const belowThreshold = pc.floats.filter((f) => (pc.balanceByFloat[f.id] ?? 0) < Number(f.replenish_threshold));

  const recentReceipts = pc.receipts.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total float value" value={formatCurrency(totalFloatValue)} sub={`${pc.floats.length} floats`} />
        <KpiTile label="Cash on hand (est.)" value={formatCurrency(totalOnHand)} sub="Replen − posted receipts" />
        <KpiTile label="Pending receipts" value={String(pendingReceipts.length)} sub={formatCurrency(pendingAmount)} tone={pendingReceipts.length ? "warn" : undefined} />
        <KpiTile label="Below threshold" value={String(belowThreshold.length)} sub={belowThreshold.length ? "Needs replenishment" : "All healthy"} tone={belowThreshold.length ? "bad" : "good"} />
      </div>

      {/* Floats grid */}
      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Floats</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/petty-cash?tab=floats">Manage floats</Link>
          </Button>
        </div>
        {pc.floats.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No floats yet. Create one under the Floats tab.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pc.floats.map((f) => {
              const bal = pc.balanceByFloat[f.id] ?? 0;
              return (
                <div key={f.id} className="rounded-lg border border-border p-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.venue}</div>
                    </div>
                    <Wallet className={`h-4 w-4 ${healthColor(bal, Number(f.replenish_threshold))}`} />
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className={`text-lg font-semibold ${healthColor(bal, Number(f.replenish_threshold))}`}>{formatCurrency(bal)}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Target {formatCurrency(f.float_amount)} · Replenish ≤ {formatCurrency(f.replenish_threshold)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent receipts */}
      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Recent receipts</h2>
          <Button asChild size="sm" variant="outline"><Link to="/petty-cash?tab=receipts">All receipts</Link></Button>
        </div>
        {recentReceipts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No receipts recorded yet.</div>
        ) : (
          <div className="text-sm">
            <div className="grid grid-cols-[90px_1fr_140px_100px_90px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
              <span>Date</span><span>Description</span><span>Classification</span><span className="text-right">Amount</span><span className="text-right">Status</span>
            </div>
            {recentReceipts.map((r) => {
              const cls = pc.classifications.find((c) => c.id === r.classification_id);
              return (
                <div key={r.id} className="grid grid-cols-[90px_1fr_140px_100px_90px] gap-3 py-2 border-b border-border/50 items-center">
                  <span className="text-xs">{fmtDate(r.receipt_date)}</span>
                  <span className="truncate">{r.description}</span>
                  <span className="text-xs">{cls?.name ?? "—"}</span>
                  <span className="text-right">{formatCurrency(r.amount)}</span>
                  <span className="text-right"><StatusBadge status={r.status} /></span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "bad" ? "text-red-500" : tone === "warn" ? "text-amber-500" : tone === "good" ? "text-emerald-500" : "";
  return (
    <div className="card-glass rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-500",
    approved: "bg-blue-500/15 text-blue-500",
    rejected: "bg-red-500/15 text-red-500",
    posted: "bg-emerald-500/15 text-emerald-500",
  };
  return <span className={`px-2 py-0.5 rounded text-[11px] ${map[status] || "bg-muted"}`}>{status}</span>;
}

/* ================================================================
 * RECEIPTS
 * ================================================================ */
function ReceiptsTab({ pc }: { pc: ReturnType<typeof usePettyCash> }) {
  const [floatId, setFloatId] = useState<string>(pc.floats[0]?.id ?? "");
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [classificationId, setClassificationId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);

  const canSubmit = floatId && amount && Number(amount) > 0 && description.trim() && classificationId;

  const submit = async () => {
    if (!canSubmit || !pc.tenantId) return;
    setSaving(true);
    try {
      let receiptPath: string | null = null;
      let receiptUrl: string | null = null;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (file && uid) {
        const path = `${uid}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("petty-cash-receipts").upload(path, file);
        if (upErr) throw upErr;
        receiptPath = path;
        const { data: signed } = await supabase.storage.from("petty-cash-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
        receiptUrl = signed?.signedUrl ?? null;
      }

      const { error } = await supabase.from("petty_cash_receipts").insert({
        tenant_id: pc.tenantId,
        float_id: floatId,
        receipt_date: receiptDate,
        amount: Number(amount),
        description: description.trim(),
        classification_id: classificationId,
        receipt_url: receiptUrl,
        receipt_path: receiptPath,
        notes: notes.trim() || null,
        status: "pending",
        created_by: uid ?? null,
      } as any);
      if (error) throw error;
      toast.success("Receipt recorded");
      setAmount(""); setDescription(""); setNotes(""); setFile(null);
      pc.reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to save receipt");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (r: PettyReceipt) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("petty_cash_receipts")
      .update({ status: "approved", approved_by: userData.user?.id ?? null, approved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Approved"); pc.reload();
  };

  const reject = async (r: PettyReceipt) => {
    const { error } = await supabase.from("petty_cash_receipts").update({ status: "rejected" }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rejected"); pc.reload();
  };

  const post = async (r: PettyReceipt) => {
    setPostingId(r.id);
    try {
      await pc.postReceipt(r);
      toast.success("Posted to GL");
    } catch (e: any) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPostingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick add — always visible */}
      <Card className="card-glass p-4">
        <div className="flex items-center gap-2 mb-3">
          <ReceiptIcon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Record a receipt</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-1">
            <Label className="text-xs">Float</Label>
            <Select value={floatId} onValueChange={setFloatId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {pc.floats.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Taxi fare to supplier" />
          </div>
          <div>
            <Label className="text-xs">Classification</Label>
            <Select value={classificationId} onValueChange={setClassificationId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {pc.classifications.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Photo / PDF</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
              <Plus className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      </Card>

      {/* List */}
      <Card className="card-glass p-4">
        <h2 className="text-sm font-semibold mb-3">All receipts</h2>
        {pc.receipts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No receipts yet.</div>
        ) : (
          <div className="text-sm overflow-x-auto">
            <div className="grid grid-cols-[90px_120px_1fr_160px_100px_90px_240px] gap-3 text-xs text-muted-foreground border-b border-border pb-2 min-w-[900px]">
              <span>Date</span><span>Float</span><span>Description</span><span>Classification</span>
              <span className="text-right">Amount</span><span className="text-right">Status</span><span className="text-right">Actions</span>
            </div>
            {pc.receipts.map((r) => {
              const cls = pc.classifications.find((c) => c.id === r.classification_id);
              const flt = pc.floats.find((f) => f.id === r.float_id);
              return (
                <div key={r.id} className="grid grid-cols-[90px_120px_1fr_160px_100px_90px_240px] gap-3 py-2 border-b border-border/50 items-center min-w-[900px]">
                  <span className="text-xs">{fmtDate(r.receipt_date)}</span>
                  <span className="truncate">{flt?.name ?? "—"}</span>
                  <span className="truncate">{r.description}</span>
                  <span className="text-xs">{cls?.name ?? "—"}</span>
                  <span className="text-right">{formatCurrency(r.amount)}</span>
                  <span className="text-right"><StatusBadge status={r.status} /></span>
                  <div className="flex justify-end gap-1">
                    {r.receipt_url && (
                      <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline px-2">View</a>
                    )}
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => approve(r)}><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => reject(r)}><X className="h-3 w-3" /></Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" onClick={() => post(r)} disabled={postingId === r.id}>
                        {postingId === r.id ? "Posting…" : "Post to GL"}
                      </Button>
                    )}
                    {r.status === "posted" && <Badge variant="outline" className="text-[10px]">JE #{r.journal_entry_id?.slice(0, 6)}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================================================================
 * REPLENISHMENTS
 * ================================================================ */
function ReplenishmentsTab({ pc }: { pc: ReturnType<typeof usePettyCash> }) {
  const [floatId, setFloatId] = useState<string>(pc.floats[0]?.id ?? "");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [bankId, setBankId] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const canSubmit = floatId && amount && Number(amount) > 0 && bankId;

  const submit = async () => {
    if (!canSubmit || !pc.tenantId) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase.from("petty_cash_replenishments").insert({
        tenant_id: pc.tenantId,
        float_id: floatId,
        replenishment_date: date,
        amount: Number(amount),
        from_bank_account_id: bankId,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        created_by: userData.user?.id ?? null,
      } as any).select("*").single();
      if (error) throw error;

      // Auto-post the journal entry with source_id back to this replenishment
      await pc.postReplenishment(inserted as PettyReplenishment);
      toast.success("Replenishment recorded and posted");
      setAmount(""); setReference(""); setNotes("");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="card-glass p-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Replenish a float</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Float</Label>
            <Select value={floatId} onValueChange={setFloatId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{pc.floats.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">From bank</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{pc.bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Cheque #123" />
          </div>
          <div className="flex items-end">
            <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
              <Plus className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Replenish"}
            </Button>
          </div>
          <div className="md:col-span-6">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="card-glass p-4">
        <h2 className="text-sm font-semibold mb-3">Replenishment history</h2>
        {pc.replenishments.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No replenishments yet.</div>
        ) : (
          <div className="text-sm">
            <div className="grid grid-cols-[90px_1fr_1fr_120px_140px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
              <span>Date</span><span>Float</span><span>Bank</span><span>Reference</span><span className="text-right">Amount</span>
            </div>
            {pc.replenishments.map((r) => {
              const flt = pc.floats.find((f) => f.id === r.float_id);
              const bank = pc.bankAccounts.find((b) => b.id === r.from_bank_account_id);
              return (
                <div key={r.id} className="grid grid-cols-[90px_1fr_1fr_120px_140px] gap-3 py-2 border-b border-border/50 items-center">
                  <span className="text-xs">{fmtDate(r.replenishment_date)}</span>
                  <span>{flt?.name ?? "—"}</span>
                  <span>{bank?.account_name ?? "—"}</span>
                  <span className="text-xs">{r.reference ?? "—"}</span>
                  <span className="text-right">{formatCurrency(r.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================================================================
 * FLOATS
 * ================================================================ */
function FloatsTab({ pc }: { pc: ReturnType<typeof usePettyCash> }) {
  const [editing, setEditing] = useState<Partial<PettyFloat> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PettyFloat | null>(null);
  const cashAccounts = pc.coa.filter((a) => a.account_type === "asset");

  const save = async () => {
    if (!editing || !pc.tenantId) return;
    const payload: any = {
      tenant_id: pc.tenantId,
      name: editing.name?.trim(),
      venue: editing.venue?.trim(),
      gl_account_id: editing.gl_account_id || null,
      float_amount: Number(editing.float_amount ?? 0),
      replenish_threshold: Number(editing.replenish_threshold ?? 0),
      is_active: editing.is_active ?? true,
      notes: editing.notes ?? null,
    };
    if (!payload.name || !payload.venue) { toast.error("Name and venue required"); return; }
    const q = editing.id
      ? supabase.from("petty_cash_floats").update(payload).eq("id", editing.id)
      : supabase.from("petty_cash_floats").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditing(null); pc.reload();
  };

  const del = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from("petty_cash_floats").delete().eq("id", confirmDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); setConfirmDelete(null); pc.reload();
  };

  return (
    <Card className="card-glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Floats</h2>
        <Button size="sm" onClick={() => setEditing({ float_amount: 2000, replenish_threshold: 500, is_active: true })}>
          <Plus className="h-4 w-4 mr-1" />New float
        </Button>
      </div>

      {pc.floats.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No floats yet.</div>
      ) : (
        <div className="text-sm">
          <div className="grid grid-cols-[1fr_1fr_130px_130px_130px_100px_100px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
            <span>Name</span><span>Venue</span><span className="text-right">Target</span><span className="text-right">Threshold</span><span className="text-right">Balance</span><span>Status</span><span className="text-right">Actions</span>
          </div>
          {pc.floats.map((f) => {
            const bal = pc.balanceByFloat[f.id] ?? 0;
            return (
              <div key={f.id} className="grid grid-cols-[1fr_1fr_130px_130px_130px_100px_100px] gap-3 py-2 border-b border-border/50 items-center">
                <span className="truncate">{f.name}</span>
                <span className="truncate text-muted-foreground">{f.venue}</span>
                <span className="text-right">{formatCurrency(f.float_amount)}</span>
                <span className="text-right">{formatCurrency(f.replenish_threshold)}</span>
                <span className={`text-right font-medium ${healthColor(bal, Number(f.replenish_threshold))}`}>{formatCurrency(bal)}</span>
                <span>{f.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</span>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(f)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{editing?.id ? "Edit float" : "New float"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div><Label className="text-xs">Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label className="text-xs">Venue</Label><Input value={editing.venue ?? ""} onChange={(e) => setEditing({ ...editing, venue: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Cash GL account</Label>
                <Select value={editing.gl_account_id ?? ""} onValueChange={(v) => setEditing({ ...editing, gl_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Target float</Label><Input type="number" step="0.01" value={editing.float_amount ?? 0} onChange={(e) => setEditing({ ...editing, float_amount: Number(e.target.value) })} /></div>
                <div><Label className="text-xs">Replenish ≤</Label><Input type="number" step="0.01" value={editing.replenish_threshold ?? 0} onChange={(e) => setEditing({ ...editing, replenish_threshold: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label className="text-xs">Active</Label></div>
              <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
          )}
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        onConfirm={del}
        title="Delete float?"
        description={`This will delete "${confirmDelete?.name}". Receipts referencing it will block deletion.`}
      />
    </Card>
  );
}

/* ================================================================
 * CLASSIFICATIONS
 * ================================================================ */
function ClassificationsTab({ pc }: { pc: ReturnType<typeof usePettyCash> }) {
  const [editing, setEditing] = useState<Partial<PettyClassification> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PettyClassification | null>(null);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      // NOTE: seed inserts MUST include tenant_id on every row.
      // The hook enforces this via `tenant_id: tenantId` on each seed row.
      await pc.seedClassifications();
      toast.success("Seed defaults added");
    } catch (e: any) {
      toast.error(e.message || "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const save = async () => {
    if (!editing || !pc.tenantId) return;
    if (!editing.name?.trim() || !editing.financial_type) { toast.error("Name and type required"); return; }
    const payload: any = {
      tenant_id: pc.tenantId,
      name: editing.name.trim(),
      financial_type: editing.financial_type,
      gl_account_id: editing.gl_account_id || null,
      color: editing.color || "#888780",
      sort_order: editing.sort_order ?? 0,
      is_active: editing.is_active ?? true,
    };
    const q = editing.id
      ? supabase.from("petty_cash_classifications").update(payload).eq("id", editing.id)
      : supabase.from("petty_cash_classifications").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditing(null); pc.reload();
  };

  const del = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from("petty_cash_classifications").delete().eq("id", confirmDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); setConfirmDelete(null); pc.reload();
  };

  return (
    <Card className="card-glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Classifications</h2>
        <div className="flex gap-2">
          {pc.classifications.length === 0 && (
            <Button size="sm" variant="outline" onClick={seed} disabled={seeding}>
              <Sparkles className="h-4 w-4 mr-1" />{seeding ? "Seeding…" : "Seed defaults"}
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing({ financial_type: "opex", color: "#888780", is_active: true, sort_order: 0 })}>
            <Plus className="h-4 w-4 mr-1" />New
          </Button>
        </div>
      </div>

      {pc.classifications.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No classifications yet — click <span className="font-medium">Seed defaults</span> to add the standard 7.
        </div>
      ) : (
        <div className="text-sm">
          <div className="grid grid-cols-[24px_1fr_100px_1fr_80px_100px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
            <span></span><span>Name</span><span>Type</span><span>GL account</span><span>Status</span><span className="text-right">Actions</span>
          </div>
          {pc.classifications.map((c) => {
            const acc = pc.coa.find((a) => a.id === c.gl_account_id);
            return (
              <div key={c.id} className="grid grid-cols-[24px_1fr_100px_1fr_80px_100px] gap-3 py-2 border-b border-border/50 items-center">
                <span className="h-4 w-4 rounded-full" style={{ background: c.color }} />
                <span>{c.name}</span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.financial_type}</span>
                <span className="text-xs">{acc ? `${acc.code} — ${acc.name}` : <span className="text-red-500">Not set</span>}</span>
                <span>{c.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</span>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(c)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{editing?.id ? "Edit classification" : "New classification"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div><Label className="text-xs">Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Financial type</Label>
                <Select value={editing.financial_type} onValueChange={(v: any) => setEditing({ ...editing, financial_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cogs">COGS</SelectItem>
                    <SelectItem value="opex">OpEx</SelectItem>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">GL account</Label>
                <Select value={editing.gl_account_id ?? ""} onValueChange={(v) => setEditing({ ...editing, gl_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{pc.coa.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Color</Label><Input type="color" value={editing.color ?? "#888780"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></div>
                <div><Label className="text-xs">Sort order</Label><Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label className="text-xs">Active</Label></div>
            </div>
          )}
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        onConfirm={del}
        title="Delete classification?"
        description={`This will delete "${confirmDelete?.name}".`}
      />
    </Card>
  );
}
