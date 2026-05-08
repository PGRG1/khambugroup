import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentProcessor, ProcessorMerchant, SettlementImport } from "@/hooks/usePaymentSettlements";
const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

type AuditStatus = "ok" | "rate_off" | "unknown_pm";
type ReconStatus = "ok" | "off" | "missing_details";

type ParsedLine = {
  payment_type: string;
  payment_type_label: string;
  count: number;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  expected_fee: number;
  fee_variance: number;
  audit_status: AuditStatus;
};
type ParsedTxn = {
  transaction_time: string;
  payment_method_raw: string;
  payment_method_key: string;
  locality: string;
  merchant_number: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  expected_fee: number;
  fee_variance: number;
  audit_status: AuditStatus;
  reference: string;
};
type ParsedBatch = {
  merchant_number: string;
  merchant_label: string;
  transaction_date: string;
  settlement_date: string;
  gross_amount: number;
  fee_amount: number;
  points_offset: number;
  bank_transfer_fee: number;
  adjustments: number;
  frozen_amount: number;
  net_settlement: number;
  count: number;
  lines: ParsedLine[];
  transactions: ParsedTxn[];
  transactions_flagged: number;
  fee_variance: number;
  audit_status: AuditStatus;
  audit_note: string;
};
type MonthlyAudit = {
  merchant_number: string;
  merchant_label: string;
  settlement_date: string;
  transaction_date: string;
  monthly_gross: number;
  monthly_fee: number;
  monthly_net: number;
  settlement_fee: number;
  adjustments: number;
  points_offset: number;
  frozen_amount: number;
  details_count: number;
  details_gross: number;
  details_fee: number;
  details_net: number;
  expected_net: number;
  reconciliation_variance: number;
  audit_status: ReconStatus;
};
type AuditSummary = {
  transactions_flagged: number;
  fee_variance: number;
  expected_fee_total: number;
  actual_fee_total: number;
  reconciliation_off?: number;
  reconciliation_variance?: number;
  settlement_fee_total?: number;
};

const STATUS_STYLE: Record<AuditStatus, string> = {
  ok: "chip chip-success",
  rate_off: "chip chip-warn",
  unknown_pm: "chip chip-danger",
};
const STATUS_LABEL: Record<AuditStatus, string> = {
  ok: "OK",
  rate_off: "Rate off",
  unknown_pm: "Unknown PM",
};
const RECON_STYLE: Record<ReconStatus, string> = {
  ok: "chip chip-success",
  off: "chip chip-warn",
  missing_details: "chip chip-danger",
};
const RECON_LABEL: Record<ReconStatus, string> = {
  ok: "OK",
  off: "Off",
  missing_details: "Missing details",
};

export function ParseSettlementModal({
  open,
  onOpenChange,
  processor,
  imp,
  merchants,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  processor: PaymentProcessor | null;
  imp: SettlementImport | null;
  merchants: ProcessorMerchant[];
  onCommitted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<ParsedBatch[]>([]);
  const [monthly, setMonthly] = useState<MonthlyAudit[]>([]);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [unknownMerchants, setUnknownMerchants] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open || !imp) return;
    setError(null); setBatches([]); setMonthly([]); setAudit(null); setUnknownMerchants([]); setExpanded(new Set());
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("parse-kpay-settlement", {
        body: { import_id: imp.id },
      });
      if (error) setError(error.message || "Parse failed");
      else if ((data as any)?.error) setError((data as any).error);
      else {
        setBatches((data as any).batches || []);
        setMonthly((data as any).monthly_audit || []);
        setAudit((data as any).audit || null);
        setUnknownMerchants((data as any).unknown_merchants || []);
      }
      setLoading(false);
    })();
  }, [open, imp]);

  const merchantByNumber = useMemo(() => {
    const m = new Map<string, ProcessorMerchant>();
    merchants.forEach((x) => m.set(x.merchant_number, x));
    return m;
  }, [merchants]);

  const detailsTotals = useMemo(() => batches.reduce(
    (acc, b) => {
      b.lines.forEach((l) => {
        acc.count += l.count;
        acc.gross += l.gross_amount;
        acc.actual += l.fee_amount;
        acc.expected += l.expected_fee;
        if (Math.abs(Number(l.fee_variance || 0)) > 0.01) acc.variance += Number(l.fee_variance || 0);
      });
      return acc;
    },
    { count: 0, gross: 0, actual: 0, expected: 0, variance: 0 },
  ), [batches]);
  const detailsVariance = Math.round((detailsTotals.variance ?? 0) * 100) / 100;

  const monthlyTotals = useMemo(() => monthly.reduce(
    (acc, m) => {
      acc.gross += m.monthly_gross;
      acc.net += m.monthly_net;
      acc.settlementFee += m.settlement_fee;
      acc.variance += m.reconciliation_variance;
      return acc;
    },
    { gross: 0, net: 0, settlementFee: 0, variance: 0 },
  ), [monthly]);

  const canCommit = batches.length > 0 && unknownMerchants.length === 0 && !loading;

  const toggle = (i: number) => {
    const next = new Set(expanded);
    next.has(i) ? next.delete(i) : next.add(i);
    setExpanded(next);
  };

  const commit = async () => {
    if (!processor || !imp || !canCommit) return;
    setCommitting(true);
    try {
      for (const b of batches) {
        const merchant = merchantByNumber.get(b.merchant_number);
        if (!merchant) throw new Error(`Unmapped merchant ${b.merchant_number}`);
        const { data: inserted, error: be } = await supabase
          .from("payment_settlement_batches" as any)
          .insert({
            import_id: imp.id,
            processor_id: processor.id,
            merchant_id: merchant.id,
            transaction_date: b.transaction_date,
            settlement_date: b.settlement_date,
            gross_amount: b.gross_amount,
            fee_amount: b.fee_amount,
            points_offset: b.points_offset,
            bank_transfer_fee: b.bank_transfer_fee,
            adjustments: b.adjustments,
            frozen_amount: b.frozen_amount,
            net_settlement: b.net_settlement,
            bank_account_id: merchant.default_bank_account_id ?? null,
            status: "unmatched",
            transactions_flagged: b.transactions_flagged,
            fee_variance: b.fee_variance,
            audit_status: b.audit_status,
            notes: b.audit_note || "",
          })
          .select("id")
          .single();
        if (be) throw be;
        const batchId = (inserted as any).id;
        if (b.lines.length > 0) {
          const { error: le } = await supabase.from("payment_settlement_lines" as any).insert(
            b.lines.map((l) => ({
              batch_id: batchId,
              payment_type: l.payment_type,
              payment_type_label: l.payment_type_label,
              count: l.count,
              gross_amount: l.gross_amount,
              fee_amount: l.fee_amount,
              net_amount: l.net_amount,
              expected_fee: l.expected_fee,
              fee_variance: l.fee_variance,
              audit_status: l.audit_status,
            })),
          );
          if (le) throw le;
        }
        if (b.transactions && b.transactions.length > 0) {
          // chunk to keep payload reasonable
          const chunk = 500;
          for (let i = 0; i < b.transactions.length; i += chunk) {
            const slice = b.transactions.slice(i, i + chunk);
            const { error: te } = await supabase.from("payment_settlement_transactions" as any).insert(
              slice.map((t) => ({
                batch_id: batchId,
                transaction_time: t.transaction_time,
                payment_method_raw: t.payment_method_raw,
                payment_method_key: t.payment_method_key,
                locality: t.locality,
                wallet_type: (t as any).wallet_type ?? null,
                merchant_number: t.merchant_number,
                gross_amount: t.gross_amount,
                fee_amount: t.fee_amount,
                net_amount: t.net_amount,
                expected_fee: t.expected_fee,
                fee_variance: t.fee_variance,
                audit_status: t.audit_status,
                reference: t.reference || "",
              })),
            );
            if (te) throw te;
          }
        }
      }
      await supabase.from("payment_settlement_imports" as any).update({ status: "parsed" }).eq("id", imp.id);
      toast({ title: "Settlement imported", description: `${batches.length} batches saved.` });
      onCommitted();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e.message || "Commit failed", variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  const detailsAnomalies = (audit?.transactions_flagged || 0) > 0;
  const reconAnomalies = (audit?.reconciliation_off || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Review settlement — {imp?.file_name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing & auditing statement…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" /> {error}
            </div>
          )}

          {!loading && !error && unknownMerchants.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-3 text-sm mb-2">
              <div className="font-medium">Unmapped merchants found</div>
              <div className="text-xs mt-1">
                Add these merchant numbers in the <strong>Merchants</strong> tab before committing:
                <ul className="list-disc ml-5 mt-1">
                  {unknownMerchants.map((m) => <li key={m} className="font-mono">{m}</li>)}
                </ul>
              </div>
            </div>
          )}

          {!loading && !error && batches.length > 0 && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList>
                <TabsTrigger value="details">
                  Settlement Details {detailsAnomalies && <span className="ml-1.5 text-amber-500">●</span>}
                </TabsTrigger>
                <TabsTrigger value="monthly">
                  Monthly Settlement Report {reconAnomalies && <span className="ml-1.5 text-amber-500">●</span>}
                </TabsTrigger>
              </TabsList>

              {/* ---------- TAB 1: SETTLEMENT DETAILS (per-transaction fee audit) ---------- */}
              <TabsContent value="details" className="mt-3">
                <Banner
                  ok={!detailsAnomalies}
                  okText="Per-transaction fees match the contracted Fee Rates exactly."
                  warnText={`${audit?.transactions_flagged} transaction(s) don't match the contracted rate sheet. Net Δ ${fmtMoney(detailsVariance)}.`}
                />

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 py-3 text-sm">
                  <Stat label="Transactions" value={String(detailsTotals.count)} />
                  <Stat label="Gross" value={fmtMoney(detailsTotals.gross)} />
                  <Stat label="Expected fee" value={fmtMoney(detailsTotals.expected)} />
                  <Stat label="Actual fee" value={fmtMoney(detailsTotals.actual)} />
                  <Stat label="Δ" value={fmtMoney(detailsVariance)} tone={detailsAnomalies ? "warn" : "ok"} />
                </div>

                <div className="rounded-md border border-border/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5">Txn time</th>
                        <th className="text-left px-2 py-1.5">Merchant</th>
                        <th className="text-left px-2 py-1.5">Payment method</th>
                        <th className="text-left px-2 py-1.5">Locality</th>
                        <th className="text-right px-2 py-1.5">Gross</th>
                        <th className="text-right px-2 py-1.5">Actual fee</th>
                        <th className="text-right px-2 py-1.5">Expected</th>
                        <th className="text-right px-2 py-1.5">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches
                        .flatMap((b) => (b.transactions || []).map((t) => ({ t, b })))
                        .sort((a, z) => z.t.transaction_time.localeCompare(a.t.transaction_time))
                        .map(({ t, b }, idx) => {
                          const merchant = merchantByNumber.get(t.merchant_number);
                          const flagged = Math.abs(Number(t.fee_variance)) > 0.01;
                          return (
                            <tr key={idx} className={`border-t border-border/40 ${flagged ? "bg-amber-500/5" : ""}`}>
                              <td className="px-2 py-1.5 td-num whitespace-nowrap">
                                {new Date(t.transaction_time).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="font-medium">{merchant?.display_name || b.merchant_label || "?"}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">{t.merchant_number}</div>
                              </td>
                              <td className="px-2 py-1.5">{t.payment_method_raw}</td>
                              <td className="px-2 py-1.5 capitalize text-muted-foreground">{t.locality || "—"}</td>
                              <td className="px-2 py-1.5 text-right td-num">{fmtMoney(t.gross_amount)}</td>
                              <td className="px-2 py-1.5 text-right td-num">{fmtMoney(t.fee_amount)}</td>
                              <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(t.expected_fee)}</td>
                              <td className={`px-2 py-1.5 text-right td-num ${flagged ? "text-amber-500 font-medium" : ""}`}>{fmtMoney(t.fee_variance)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* ---------- TAB 2: MONTHLY SETTLEMENT REPORT (batch reconciliation) ---------- */}
              <TabsContent value="monthly" className="mt-3">
                <Banner
                  ok={!reconAnomalies}
                  okText="All batches reconcile to the Settlement details (HK$1 settlement fee accounted for)."
                  warnText={`${audit?.reconciliation_off} batch(es) don't reconcile. Net Δ ${fmtMoney(monthlyTotals.variance)}.`}
                />

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 py-3 text-sm">
                  <Stat label="Batches" value={String(monthly.length)} />
                  <Stat label="Gross" value={fmtMoney(monthlyTotals.gross)} />
                  <Stat label="Net settled" value={fmtMoney(monthlyTotals.net)} />
                  <Stat label="Settlement fees" value={fmtMoney(monthlyTotals.settlementFee)} />
                  <Stat label="Recon Δ" value={fmtMoney(monthlyTotals.variance)} tone={Math.abs(monthlyTotals.variance) > 0.01 ? "warn" : "ok"} />
                </div>

                <div className="rounded-md border border-border/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
                      <tr>
                        <th className="text-left px-2 py-1.5">Settle</th>
                        <th className="text-left px-2 py-1.5">Txn</th>
                        <th className="text-left px-2 py-1.5">Merchant</th>
                        <th className="text-right px-2 py-1.5">#</th>
                        <th className="text-right px-2 py-1.5">Details net</th>
                        <th className="text-right px-2 py-1.5">Settle fee</th>
                        <th className="text-right px-2 py-1.5">Adj/Pts/Frz</th>
                        <th className="text-right px-2 py-1.5">Expected net</th>
                        <th className="text-right px-2 py-1.5">Monthly net</th>
                        <th className="text-right px-2 py-1.5">Δ</th>
                        <th className="text-left px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m, idx) => {
                        const merchant = merchantByNumber.get(m.merchant_number);
                        const off = m.audit_status !== "ok";
                        const adjBlock = m.adjustments + m.points_offset - m.frozen_amount;
                        return (
                          <tr key={idx} className={`border-t border-border/40 ${off ? "bg-amber-500/5" : ""}`}>
                            <td className="px-2 py-1.5">{fmtDate(m.settlement_date)}</td>
                            <td className="px-2 py-1.5">{fmtDate(m.transaction_date)}</td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium">{merchant?.display_name || m.merchant_label || "?"}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{m.merchant_number}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right td-num">{m.details_count}</td>
                            <td className="px-2 py-1.5 text-right td-num">{fmtMoney(m.details_net)}</td>
                            <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(-m.settlement_fee)}</td>
                            <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(adjBlock)}</td>
                            <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(m.expected_net)}</td>
                            <td className="px-2 py-1.5 text-right td-num font-medium">{fmtMoney(m.monthly_net)}</td>
                            <td className={`px-2 py-1.5 text-right td-num ${Math.abs(m.reconciliation_variance) > 0.01 ? "text-amber-500 font-medium" : ""}`}>
                              {fmtMoney(m.reconciliation_variance)}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={RECON_STYLE[m.audit_status]}>{RECON_LABEL[m.audit_status]}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {!loading && !error && batches.length === 0 && (
            <div className="text-sm text-muted-foreground py-10 text-center">No settlement batches detected in this file.</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={commit} disabled={!canCommit || committing}>
            {committing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Confirm & save {batches.length > 0 ? `(${batches.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Banner({ ok, okText, warnText }: { ok: boolean; okText: string; warnText: string }) {
  return ok ? (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 p-2.5 text-xs flex items-center gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" /> {okText}
    </div>
  ) : (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-2.5 text-xs flex items-center gap-1.5">
      <AlertTriangle className="h-3.5 w-3.5" /> {warnText}
    </div>
  );
}

function DetailsRow({
  isOpen, onToggle, flagged, batch, merchantLabel, expectedBatch,
}: {
  isOpen: boolean; onToggle: () => void; flagged: boolean;
  batch: ParsedBatch; merchantLabel: string; expectedBatch: number;
}) {
  return (
    <>
      <tr
        className={`border-t border-border/40 cursor-pointer hover:bg-muted/30 ${flagged ? "bg-amber-500/5" : ""}`}
        onClick={onToggle}
      >
        <td className="px-1 text-muted-foreground">{isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</td>
        <td className="px-2 py-1.5">{fmtDate(batch.settlement_date)}</td>
        <td className="px-2 py-1.5">{fmtDate(batch.transaction_date)}</td>
        <td className="px-2 py-1.5">
          <div className="font-medium">{merchantLabel}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{batch.merchant_number}</div>
        </td>
        <td className="px-2 py-1.5 text-right td-num">{batch.lines.reduce((s, l) => s + l.count, 0)}</td>
        <td className="px-2 py-1.5 text-right td-num">{fmtMoney(batch.lines.reduce((s, l) => s + l.gross_amount, 0))}</td>
        <td className="px-2 py-1.5 text-right td-num">{fmtMoney(batch.lines.reduce((s, l) => s + l.fee_amount, 0))}</td>
        <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(expectedBatch)}</td>
        <td className={`px-2 py-1.5 text-right td-num ${Math.abs(batch.fee_variance) > 0.01 ? "text-amber-500 font-medium" : ""}`}>
          {fmtMoney(batch.fee_variance)}
        </td>
        <td className="px-2 py-1.5">
          <span className={STATUS_STYLE[batch.audit_status]}>{STATUS_LABEL[batch.audit_status]}{batch.transactions_flagged > 0 ? ` · ${batch.transactions_flagged}` : ""}</span>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/10">
          <td></td>
          <td colSpan={9} className="px-2 py-2">
            {batch.audit_note && (
              <div className="text-[11px] text-amber-500 mb-2 italic">📝 {batch.audit_note}</div>
            )}
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Payment method</th>
                  <th className="text-right py-1">Count</th>
                  <th className="text-right py-1">Gross</th>
                  <th className="text-right py-1">Actual fee</th>
                  <th className="text-right py-1">Expected fee</th>
                  <th className="text-right py-1">Δ</th>
                  <th className="text-left py-1 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {batch.lines.map((l, i) => (
                  <tr key={i} className="border-t border-border/20">
                    <td className="py-1">{l.payment_type_label}</td>
                    <td className="py-1 text-right td-num">{l.count}</td>
                    <td className="py-1 text-right td-num">{fmtMoney(l.gross_amount)}</td>
                    <td className="py-1 text-right td-num">{fmtMoney(l.fee_amount)}</td>
                    <td className="py-1 text-right td-num text-muted-foreground">{fmtMoney(l.expected_fee)}</td>
                    <td className={`py-1 text-right td-num ${Math.abs(l.fee_variance) > 0.01 ? "text-amber-500 font-medium" : ""}`}>{fmtMoney(l.fee_variance)}</td>
                    <td className="py-1 pl-3"><span className={STATUS_STYLE[l.audit_status]}>{STATUS_LABEL[l.audit_status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-border/40 bg-muted/20"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`td-num font-medium ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
    </div>
  );
}
