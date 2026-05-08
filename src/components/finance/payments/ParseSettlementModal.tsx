import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentProcessor, ProcessorMerchant, SettlementImport } from "@/hooks/usePaymentSettlements";
import { formatCurrency as fmtMoney } from "@/utils/salesUtils";

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

type AuditStatus = "ok" | "rate_off" | "unknown_pm";

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
  transactions_flagged: number;
  fee_variance: number;
  audit_status: AuditStatus;
  audit_note: string;
};
type AuditSummary = { transactions_flagged: number; fee_variance: number; expected_fee_total: number; actual_fee_total: number };

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
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [unknownMerchants, setUnknownMerchants] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open || !imp) return;
    setError(null); setBatches([]); setAudit(null); setUnknownMerchants([]); setExpanded(new Set());
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("parse-kpay-settlement", {
        body: { import_id: imp.id },
      });
      if (error) setError(error.message || "Parse failed");
      else if ((data as any)?.error) setError((data as any).error);
      else {
        setBatches((data as any).batches || []);
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

  const totals = useMemo(() => batches.reduce(
    (acc, b) => {
      acc.gross += b.gross_amount; acc.fee += b.fee_amount; acc.net += b.net_settlement; acc.count += b.count;
      return acc;
    },
    { gross: 0, fee: 0, net: 0, count: 0 },
  ), [batches]);

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

  const hasAnomalies = (audit?.transactions_flagged || 0) > 0;

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
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-3 text-sm">
              <div className="font-medium">Unmapped merchants found</div>
              <div className="text-xs mt-1">
                Add these merchant numbers in the <strong>Merchants</strong> tab before committing:
                <ul className="list-disc ml-5 mt-1">
                  {unknownMerchants.map((m) => <li key={m} className="font-mono">{m}</li>)}
                </ul>
              </div>
            </div>
          )}

          {!loading && !error && hasAnomalies && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-3 text-xs mt-2">
              <div className="font-medium flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Fee audit found anomalies</div>
              <div className="mt-1">
                {audit?.transactions_flagged} transaction(s) don't match the contracted rate sheet. Net variance:{" "}
                <span className="td-num font-medium">{fmtMoney(audit?.fee_variance || 0)}</span>. Review highlighted batches before saving.
              </div>
            </div>
          )}

          {!loading && !error && batches.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 py-3 text-sm">
                <Stat label="Batches" value={String(batches.length)} />
                <Stat label="Transactions" value={String(totals.count)} />
                <Stat label="Gross" value={fmtMoney(totals.gross)} />
                <Stat label="Net settled" value={fmtMoney(totals.net)} />
                <Stat label="Expected fee" value={fmtMoney(audit?.expected_fee_total || 0)} />
                <Stat label="Fee variance" value={fmtMoney(audit?.fee_variance || 0)} tone={hasAnomalies ? "warn" : "ok"} />
              </div>

              <div className="rounded-md border border-border/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
                    <tr>
                      <th className="w-6"></th>
                      <th className="text-left px-2 py-1.5">Settle</th>
                      <th className="text-left px-2 py-1.5">Txn</th>
                      <th className="text-left px-2 py-1.5">Merchant</th>
                      <th className="text-right px-2 py-1.5">#</th>
                      <th className="text-right px-2 py-1.5">Gross</th>
                      <th className="text-right px-2 py-1.5">Actual fee</th>
                      <th className="text-right px-2 py-1.5">Expected</th>
                      <th className="text-right px-2 py-1.5">Δ</th>
                      <th className="text-right px-2 py-1.5">Net</th>
                      <th className="text-left px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, idx) => {
                      const merchant = merchantByNumber.get(b.merchant_number);
                      const expectedBatch = b.lines.reduce((s, l) => s + l.expected_fee, 0);
                      const isOpen = expanded.has(idx);
                      const flagged = b.audit_status !== "ok";
                      return (
                        <FragmentRow
                          key={idx}
                          isOpen={isOpen}
                          onToggle={() => toggle(idx)}
                          flagged={flagged}
                          batch={b}
                          merchantLabel={merchant?.display_name || b.merchant_label || "?"}
                          expectedBatch={expectedBatch}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
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

function FragmentRow({
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
        <td className="px-2 py-1.5 text-right td-num">{batch.count}</td>
        <td className="px-2 py-1.5 text-right td-num">{fmtMoney(batch.gross_amount)}</td>
        <td className="px-2 py-1.5 text-right td-num">{fmtMoney(batch.fee_amount)}</td>
        <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(expectedBatch)}</td>
        <td className={`px-2 py-1.5 text-right td-num ${Math.abs(batch.fee_variance) > 0.01 ? "text-amber-500 font-medium" : ""}`}>
          {fmtMoney(batch.fee_variance)}
        </td>
        <td className="px-2 py-1.5 text-right td-num font-medium">{fmtMoney(batch.net_settlement)}</td>
        <td className="px-2 py-1.5">
          <span className={STATUS_STYLE[batch.audit_status]}>{STATUS_LABEL[batch.audit_status]}{batch.transactions_flagged > 0 ? ` · ${batch.transactions_flagged}` : ""}</span>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/10">
          <td></td>
          <td colSpan={10} className="px-2 py-2">
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
                  <th className="text-right py-1">Net</th>
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
                    <td className="py-1 text-right td-num">{fmtMoney(l.net_amount)}</td>
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
