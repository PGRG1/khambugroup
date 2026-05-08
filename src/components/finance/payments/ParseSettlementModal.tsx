import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentProcessor, ProcessorMerchant, SettlementImport } from "@/hooks/usePaymentSettlements";
import { formatCurrency as fmtMoney } from "@/utils/salesUtils";
const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

type ParsedLine = {
  payment_type: string;
  payment_type_label: string;
  count: number;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
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
  const [unknownMerchants, setUnknownMerchants] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !imp) return;
    setError(null);
    setBatches([]);
    setUnknownMerchants([]);
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("parse-kpay-settlement", {
        body: { import_id: imp.id },
      });
      if (error) {
        setError(error.message || "Parse failed");
      } else if ((data as any)?.error) {
        setError((data as any).error);
      } else {
        setBatches((data as any).batches || []);
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

  const totals = useMemo(() => {
    return batches.reduce(
      (acc, b) => {
        acc.gross += b.gross_amount;
        acc.fee += b.fee_amount;
        acc.net += b.net_settlement;
        acc.count += b.count;
        return acc;
      },
      { gross: 0, fee: 0, net: 0, count: 0 },
    );
  }, [batches]);

  const canCommit = batches.length > 0 && unknownMerchants.length === 0 && !loading;

  const commit = async () => {
    if (!processor || !imp || !canCommit) return;
    setCommitting(true);
    try {
      // Insert batches one-by-one to capture IDs for lines
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
            })),
          );
          if (le) throw le;
        }
      }
      await supabase
        .from("payment_settlement_imports" as any)
        .update({ status: "parsed" })
        .eq("id", imp.id);
      toast({ title: "Settlement imported", description: `${batches.length} batches saved.` });
      onCommitted();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e.message || "Commit failed", variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Review settlement — {imp?.file_name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing statement…
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

          {!loading && !error && batches.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-3 py-3 text-sm">
                <Stat label="Batches" value={String(batches.length)} />
                <Stat label="Transactions" value={String(totals.count)} />
                <Stat label="Gross" value={fmtMoney(totals.gross)} />
                <Stat label="Net settled" value={fmtMoney(totals.net)} />
              </div>

              <div className="rounded-md border border-border/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1.5">Settle date</th>
                      <th className="text-left px-2 py-1.5">Txn date</th>
                      <th className="text-left px-2 py-1.5">Merchant</th>
                      <th className="text-right px-2 py-1.5">#</th>
                      <th className="text-right px-2 py-1.5">Gross</th>
                      <th className="text-right px-2 py-1.5">Fee</th>
                      <th className="text-right px-2 py-1.5">Bank fee</th>
                      <th className="text-right px-2 py-1.5">Net</th>
                      <th className="text-left px-2 py-1.5">Payment types</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, idx) => {
                      const merchant = merchantByNumber.get(b.merchant_number);
                      return (
                        <tr key={idx} className="border-t border-border/40">
                          <td className="px-2 py-1.5">{fmtDate(b.settlement_date)}</td>
                          <td className="px-2 py-1.5">{fmtDate(b.transaction_date)}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{merchant?.display_name || b.merchant_label || "?"}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{b.merchant_number}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right td-num">{b.count}</td>
                          <td className="px-2 py-1.5 text-right td-num">{fmtMoney(b.gross_amount)}</td>
                          <td className="px-2 py-1.5 text-right td-num">{fmtMoney(b.fee_amount)}</td>
                          <td className="px-2 py-1.5 text-right td-num">{fmtMoney(b.bank_transfer_fee)}</td>
                          <td className="px-2 py-1.5 text-right td-num font-medium">{fmtMoney(b.net_settlement)}</td>
                          <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            {b.lines.map((l) => l.payment_type_label).join(", ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && !error && batches.length === 0 && (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No settlement batches detected in this file.
            </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="td-num font-medium">{value}</div>
    </div>
  );
}
