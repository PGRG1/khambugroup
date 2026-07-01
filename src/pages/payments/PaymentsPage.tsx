import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/salesUtils";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { usePaymentSettlements, type PaymentProcessor } from "@/hooks/usePaymentSettlements";
import { useBankModule } from "@/hooks/useBankModule";
import { MerchantsTab } from "@/components/finance/payments/MerchantsTab";
import { ImportsTab } from "@/components/finance/payments/ImportsTab";
import { FeeRatesTab } from "@/components/finance/payments/FeeRatesTab";
import { SettlementDetailsAuditTab } from "@/components/finance/payments/SettlementDetailsAuditTab";
import { MonthlyReconciliationTab } from "@/components/finance/payments/MonthlyReconciliationTab";
import { SettlementBatchesTab } from "@/components/finance/payments/SettlementBatchesTab";

const ALL = "__all__";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "batches", label: "Batches" },
  { key: "details-audit", label: "Fee Audit" },
  { key: "monthly-recon", label: "Monthly Check" },
  { key: "__divider__", label: "" },
  { key: "processors", label: "Processors" },
  { key: "merchants", label: "Merchants" },
  { key: "fee-rates", label: "Fee Rates" },
  { key: "imports", label: "Imports" },
] as const;

export default function PaymentsPage() {
  const { tenantId, processors, merchants, imports, batches, lines, transactions, feeRates, reload } = usePaymentSettlements();
  const { accounts: bankAccounts, transactions: bankTxns } = useBankModule();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const setTab = (t: string) => {
    if (t === "overview") setParams({});
    else setParams({ tab: t });
  };

  const [processorId, setProcessorId] = useState<string>(ALL);
  const [didInit, setDidInit] = useState(false);
  useEffect(() => {
    if (didInit || !processors.length) return;
    const kpay = processors.find((p) => /kpay/i.test(p.name)) || processors[0];
    if (kpay) setProcessorId(kpay.id);
    setDidInit(true);
  }, [processors, didInit]);

  const feeRateCountByProcessor = useMemo(() => {
    const m = new Map<string, number>();
    feeRates.forEach((r) => m.set(r.processor_id, (m.get(r.processor_id) || 0) + 1));
    return m;
  }, [feeRates]);
  const merchantCountByProcessor = useMemo(() => {
    const m = new Map<string, number>();
    merchants.forEach((mm) => m.set(mm.processor_id, (m.get(mm.processor_id) || 0) + 1));
    return m;
  }, [merchants]);
  const lastImportByProcessor = useMemo(() => {
    const m = new Map<string, string>();
    imports.forEach((i) => {
      const prev = m.get(i.processor_id);
      if (!prev || i.uploaded_at > prev) m.set(i.processor_id, i.uploaded_at);
    });
    return m;
  }, [imports]);
  const unmatchedByProcessor = useMemo(() => {
    const m = new Map<string, number>();
    batches.forEach((b) => { if (b.status === "unmatched") m.set(b.processor_id, (m.get(b.processor_id) || 0) + 1); });
    return m;
  }, [batches]);

  const isAll = processorId === ALL;
  const processor = useMemo(() => (isAll ? null : processors.find((p) => p.id === processorId) || null), [processors, processorId, isAll]);

  const procBatches = useMemo(
    () => (isAll ? batches : processor ? batches.filter((b) => b.processor_id === processor.id) : []),
    [batches, processor, isAll],
  );
  const procBatchIds = useMemo(() => new Set(procBatches.map((b) => b.id)), [procBatches]);
  const procLines = useMemo(() => lines.filter((l) => procBatchIds.has(l.batch_id)), [lines, procBatchIds]);
  const procTxns = useMemo(() => transactions.filter((t) => procBatchIds.has(t.batch_id)), [transactions, procBatchIds]);
  const procMerchants = isAll ? merchants : processor ? merchants.filter((m) => m.processor_id === processor.id) : [];

  const totalGross = procBatches.reduce((s, b) => s + Number(b.gross_amount || 0), 0);
  const totalFees = procBatches.reduce((s, b) => s + Math.abs(Number(b.fee_amount || 0)) + Math.abs(Number(b.bank_transfer_fee || 0)), 0);
  const totalNet = procBatches.reduce((s, b) => s + Number(b.net_settlement || 0), 0);
  const unmatched = procBatches.filter((b) => b.status === "unmatched").length;

  // Workflow stepper active step
  const scopedImports = isAll ? imports : imports.filter((i) => processor && i.processor_id === processor.id);
  const activeStep = (() => {
    if (scopedImports.length === 0) return 1;
    if (procBatches.length === 0) return 2;
    if (procBatches.some((b) => b.audit_status && b.audit_status !== "ok")) return 3;
    if (procBatches.some((b) => b.status === "unmatched")) return 4;
    return 5;
  })();

  return (
    <div className="p-6 space-y-6">
      {/* Header row 1 */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Payments & Settlements</h1>
          <p className="text-sm text-muted-foreground mt-1">Settlement statements, fee verification, and bank matching.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={processorId} onValueChange={setProcessorId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Choose processor" /></SelectTrigger>
            <SelectContent>
              {processors.map((p) => {
                const n = feeRateCountByProcessor.get(p.id) || 0;
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground">· {n} {n === 1 ? "rule" : "rules"}</span>
                  </SelectItem>
                );
              })}
              <SelectItem value={ALL}>All processors</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Header row 2 — workflow stepper */}
      <Stepper active={activeStep} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gross transactions" value={formatCurrency(totalGross)} sub={`${procBatches.length} batches`} />
        <KpiCard label="Total fees" value={formatCurrency(totalFees)} sub="Processor + bank transfer" />
        <KpiCard label="Net settled" value={formatCurrency(totalNet)} sub="To bank accounts" />
        <KpiCard label="Unmatched batches" value={String(unmatched)} sub="Need bank match" valueClass={unmatched > 0 ? "text-amber-400" : "text-emerald-400"} />
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center flex-wrap">
        {TABS.map((t) => {
          if (t.key === "__divider__") return <div key="div" className="w-px h-4 bg-border mx-2 self-center" />;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm cursor-pointer border-b-2 transition-colors ${
                active
                  ? "border-amber-400 text-amber-400 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab bodies */}
      {tab === "overview" && (
        <OverviewPanel
          processors={processors}
          batches={batches}
          merchantCountByProcessor={merchantCountByProcessor}
          feeRateCountByProcessor={feeRateCountByProcessor}
          lastImportByProcessor={lastImportByProcessor}
          unmatchedByProcessor={unmatchedByProcessor}
          onOpenProcessor={(id) => { setProcessorId(id); setTab("batches"); }}
          onGotoBatches={() => setTab("batches")}
          onGotoProcessors={() => setTab("processors")}
        />
      )}

      {tab === "batches" && (
        <SettlementBatchesTab
          processor={processor}
          merchants={procMerchants}
          batches={procBatches}
          lines={procLines}
          transactions={procTxns}
          bankTxns={bankTxns}
          bankAccounts={bankAccounts}
          onReload={reload}
        />
      )}

      {tab === "details-audit" && (
        <SettlementDetailsAuditTab processor={processor} merchants={procMerchants} batches={procBatches} transactions={procTxns} />
      )}

      {tab === "monthly-recon" && (
        <MonthlyReconciliationTab processor={processor} merchants={procMerchants} batches={procBatches} lines={procLines} />
      )}

      {tab === "processors" && (
        <ProcessorsTab
          processors={processors}
          merchantCountByProcessor={merchantCountByProcessor}
          feeRateCountByProcessor={feeRateCountByProcessor}
          tenantId={tenantId}
          onReload={reload}
        />
      )}

      {tab === "merchants" && (
        <MerchantsTab processor={processor} merchants={merchants} bankAccounts={bankAccounts} onChanged={reload} />
      )}

      {tab === "imports" && (
        <ImportsTab processor={processor} imports={imports} merchants={merchants} tenantId={tenantId} onChanged={reload} />
      )}

      {tab === "fee-rates" && (
        <FeeRatesTab processor={processor} merchants={procMerchants} allProcessors={processors} allMerchants={merchants} allFeeRates={feeRates} onReload={reload} />
      )}
    </div>
  );
}

/* ---------- Small components ---------- */

function KpiCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card className="card-glass p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold td-num mt-1 ${valueClass || ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function Stepper({ active }: { active: number }) {
  const steps = [
    { n: 1, label: "Import statement" },
    { n: 2, label: "Parse batches" },
    { n: 3, label: "Audit fees" },
    { n: 4, label: "Match to bank" },
  ];
  const glyph = ["①", "②", "③", "④"];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, idx) => {
        const done = active > s.n;
        const isActive = active === s.n;
        const cls = done
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
          : isActive
          ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
          : "bg-muted/30 text-muted-foreground border border-border";
        return (
          <div key={s.n} className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] ${cls}`}>
              {glyph[idx]} {s.label}
            </span>
            {idx < steps.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Overview ---------- */

function OverviewPanel({
  processors, batches, merchantCountByProcessor, feeRateCountByProcessor,
  lastImportByProcessor, unmatchedByProcessor,
  onOpenProcessor, onGotoBatches, onGotoProcessors,
}: {
  processors: PaymentProcessor[];
  batches: any[];
  merchantCountByProcessor: Map<string, number>;
  feeRateCountByProcessor: Map<string, number>;
  lastImportByProcessor: Map<string, string>;
  unmatchedByProcessor: Map<string, number>;
  onOpenProcessor: (id: string) => void;
  onGotoBatches: () => void;
  onGotoProcessors: () => void;
}) {
  const recentBatches = useMemo(
    () => [...batches].sort((a, b) => (b.settlement_date || "").localeCompare(a.settlement_date || "")).slice(0, 8),
    [batches],
  );

  const statusBadge = (s: string) => {
    switch (s) {
      case "matched": return "chip chip-success";
      case "unmatched": return "chip chip-warn";
      case "parsed": return "chip chip-info";
      default: return "chip chip-neutral";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Processors */}
      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Processors</h3>
          <span className="text-[11px] text-muted-foreground">{processors.length} total</span>
        </div>
        {processors.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center space-y-2">
            <div>No processors configured. Add one in the Processors tab.</div>
            <Button size="sm" variant="outline" onClick={onGotoProcessors}>Go to Processors</Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {processors.map((p) => {
              const unm = unmatchedByProcessor.get(p.id) || 0;
              const mc = merchantCountByProcessor.get(p.id) || 0;
              const fr = feeRateCountByProcessor.get(p.id) || 0;
              const last = lastImportByProcessor.get(p.id);
              const borderColor = unm > 0 ? "border-l-amber-400" : "border-l-emerald-400";
              return (
                <button
                  key={p.id}
                  onClick={() => onOpenProcessor(p.id)}
                  className={`w-full text-left rounded-md border border-border/40 border-l-2 ${borderColor} px-3 py-2 hover:bg-muted/30 transition-colors flex items-center gap-3`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{p.name}</span>
                      <span className="chip chip-info text-[10px]">{p.type}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {mc} merchant{mc === 1 ? "" : "s"} · {fr} rule{fr === 1 ? "" : "s"} · Last import: {fmtDate(last)}
                    </div>
                  </div>
                  {unm > 0 && <span className="chip chip-warn text-[10px]">{unm} unmatched</span>}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent batches */}
      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Recent batches</h3>
          <button className="text-xs text-amber-400 hover:underline" onClick={onGotoBatches}>View all →</button>
        </div>
        {recentBatches.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center space-y-2">
            <div>No batches yet. Parse an imported statement to create batches.</div>
            <Button size="sm" variant="outline" onClick={onGotoBatches}>Go to Batches</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <th className="text-left px-2 py-1.5">Settlement</th>
                  <th className="text-left px-2 py-1.5">Merchant</th>
                  <th className="text-right px-2 py-1.5">Net</th>
                  <th className="text-left px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((b, idx) => (
                  <tr
                    key={b.id}
                    onClick={onGotoBatches}
                    className={`border-t border-border/40 cursor-pointer hover:bg-muted/40 ${idx % 2 === 0 ? "bg-muted/30" : ""}`}
                  >
                    <td className="px-2 py-1.5">{fmtDate(b.settlement_date)}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground font-mono">{b.merchant_id?.slice(0, 8) || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-mono">{formatCurrency(Number(b.net_settlement || 0))}</td>
                    <td className="px-2 py-1.5"><span className={statusBadge(b.status)}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Processors CRUD ---------- */

type ProcessorForm = {
  id?: string;
  name: string;
  type: string;
  notes: string;
  is_active: boolean;
};

function ProcessorsTab({
  processors, merchantCountByProcessor, feeRateCountByProcessor, tenantId, onReload,
}: {
  processors: PaymentProcessor[];
  merchantCountByProcessor: Map<string, number>;
  feeRateCountByProcessor: Map<string, number>;
  tenantId: string | null;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<ProcessorForm | null>(null);
  const [delTarget, setDelTarget] = useState<PaymentProcessor | null>(null);

  const openNew = () => setEditing({ name: "", type: "card", notes: "", is_active: true });
  const openEdit = (p: PaymentProcessor) => setEditing({ id: p.id, name: p.name, type: p.type, notes: p.notes || "", is_active: p.is_active });

  const toggleActive = async (p: PaymentProcessor) => {
    const { error } = await supabase.from("payment_processors" as any).update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    onReload();
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Name is required");
    if (!tenantId) return toast.error("No active tenant");
    const payload: any = {
      name: editing.name.trim(),
      type: editing.type,
      notes: editing.notes || "",
      is_active: editing.is_active,
    };
    if (editing.id) {
      const { error } = await supabase.from("payment_processors" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Processor updated");
    } else {
      const { error } = await supabase.from("payment_processors" as any).insert({
        ...payload,
        tenant_id: tenantId,
        sort_order: processors.length,
      });
      if (error) return toast.error(error.message);
      toast.success("Processor added");
    }
    setEditing(null);
    onReload();
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    const mc = merchantCountByProcessor.get(delTarget.id) || 0;
    if (mc > 0) {
      toast.error(`This processor has ${mc} merchant${mc === 1 ? "" : "s"}. Remove them first.`);
      setDelTarget(null);
      return;
    }
    const { error } = await supabase.from("payment_processors" as any).delete().eq("id", delTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Processor deleted");
    setDelTarget(null);
    onReload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Payment processors</h3>
          <p className="text-xs text-muted-foreground">Configure the payment processors you receive settlements from.</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add processor</Button>
      </div>

      <Card className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Merchants</th>
                <th className="text-right px-3 py-2">Fee rules</th>
                <th className="text-left px-3 py-2">Active</th>
                <th className="text-right px-3 py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {processors.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No processors yet. Add one to get started.</td></tr>
              )}
              {processors.map((p, idx) => (
                <tr key={p.id} className={`border-t border-border/40 hover:bg-muted/40 ${idx % 2 === 0 ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2"><span className="chip chip-info">{p.type}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">{merchantCountByProcessor.get(p.id) || 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-mono">{feeRateCountByProcessor.get(p.id) || 0}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleActive(p)} className={`chip ${p.is_active ? "chip-success" : "chip-neutral"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit processor" : "Add processor"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div>
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="KPay, YeahPay, Stripe…" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="mobile_payment">Mobile payment</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={3} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        onConfirm={confirmDelete}
        title="Delete this processor?"
        description="This action cannot be undone."
      />
    </div>
  );
}
