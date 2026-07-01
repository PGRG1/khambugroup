import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentProcessor, ProcessorMerchant, SettlementBatch } from "@/hooks/usePaymentSettlements";
import type { BankTxn, BankAccount } from "@/hooks/useBankModule";

const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

type Suggestion = {
  batch_id: string;
  bank_transaction_id: string | null;
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
  amount_delta: number | null;
  date_delta_days: number | null;
};

const CONF_STYLE: Record<string, string> = {
  high: "chip chip-success",
  medium: "chip chip-info",
  low: "chip chip-warn",
  none: "chip chip-danger",
};

export function AiMatchModal({
  open,
  onOpenChange,
  processor,
  merchants,
  batches,
  bankTxns,
  bankAccounts,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  processor: PaymentProcessor | null;
  merchants: ProcessorMerchant[];
  batches: SettlementBatch[];
  bankTxns: BankTxn[];
  bankAccounts: BankAccount[];
  onApplied: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const merchantById = useMemo(() => new Map(merchants.map((m) => [m.id, m])), [merchants]);
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const txnById = useMemo(() => new Map(bankTxns.map((t) => [t.id, t])), [bankTxns]);
  const acctById = useMemo(() => new Map(bankAccounts.map((a) => [a.id, a])), [bankAccounts]);

  const unmatched = useMemo(
    () => batches.filter((b) => !b.bank_transaction_id && b.status !== "matched"),
    [batches],
  );

  const run = async () => {
    if (!processor || unmatched.length === 0) return;
    setRunning(true);
    setSuggestions([]);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("match-settlement-batches", {
        body: { processor_id: processor.id, batch_ids: unmatched.map((b) => b.id), day_window: 5 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const ss = ((data as any)?.suggestions || []) as Suggestion[];
      setSuggestions(ss);
      // Pre-select all high-confidence suggestions
      setSelected(new Set(ss.filter((s) => s.bank_transaction_id && s.confidence === "high").map((s) => s.batch_id)));
      toast({ title: "AI matching complete", description: `${ss.filter((s) => s.bank_transaction_id).length} of ${ss.length} batches matched.` });
    } catch (e) {
      toast({ title: "Matching failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    const toApply = suggestions.filter((s) => selected.has(s.batch_id) && s.bank_transaction_id);
    if (toApply.length === 0) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("match-settlement-batches", {
        body: { apply: true, suggestions: toApply },
      });
      if (error) throw error;
      toast({ title: "Matches applied", description: `${(data as any)?.applied ?? 0} batches linked to bank deposits.` });
      onApplied();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Apply failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const matchableCount = suggestions.filter((s) => s.bank_transaction_id).length;
  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Auto-Match — Settlement Batches → Bank Deposits
          </DialogTitle>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <div className="py-6 space-y-3 text-sm">
            <p className="text-muted-foreground">
              The AI will scan every <b>unmatched batch</b> ({unmatched.length}) and try to pair each one with the
              corresponding incoming deposit on the merchant's default bank account. Exact-amount matches within ±5 days
              are auto-selected; ambiguous cases are decided by the AI with a written reason.
            </p>
            <div className="flex justify-end">
              <Button onClick={run} disabled={running || unmatched.length === 0}>
                {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Matching…</> : <><Sparkles className="h-4 w-4 mr-2" /> Run AI Match</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="chip chip-success">{suggestions.filter((s) => s.confidence === "high").length} high</span>
              <span className="chip chip-info">{suggestions.filter((s) => s.confidence === "medium").length} medium</span>
              <span className="chip chip-warn">{suggestions.filter((s) => s.confidence === "low").length} low</span>
              <span className="chip chip-danger">{suggestions.filter((s) => s.confidence === "none").length} none</span>
              <span className="ml-auto text-muted-foreground">
                {selectedCount} of {matchableCount} selected to apply
              </span>
            </div>

            <div className="rounded-md border border-border/40 overflow-auto max-h-[55vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground sticky top-0">
                  <tr>
                    <th className="w-8 px-2 py-1.5"></th>
                    <th className="text-left px-2 py-1.5">Batch (settle / merchant)</th>
                    <th className="text-right px-2 py-1.5">Net</th>
                    <th className="text-left px-2 py-1.5">Suggested deposit</th>
                    <th className="text-right px-2 py-1.5">Δ Amount</th>
                    <th className="text-right px-2 py-1.5">Δ Days</th>
                    <th className="text-left px-2 py-1.5">Confidence</th>
                    <th className="text-left px-2 py-1.5">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => {
                    const b = batchById.get(s.batch_id);
                    const merch = b ? merchantById.get(b.merchant_id) : undefined;
                    const t = s.bank_transaction_id ? txnById.get(s.bank_transaction_id) : undefined;
                    const acct = t ? acctById.get(t.bank_account_id) : undefined;
                    const canSelect = !!s.bank_transaction_id;
                    return (
                      <tr key={s.batch_id} className="border-t border-border/40">
                        <td className="px-2 py-1.5">
                          <Checkbox
                            checked={selected.has(s.batch_id)}
                            onCheckedChange={() => toggle(s.batch_id)}
                            disabled={!canSelect}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-medium">{merch?.display_name || "?"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {b ? fmtDate(b.settlement_date) : "—"} · {merch?.merchant_number}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right td-num font-medium">
                          {fmtMoney(Number(b?.net_settlement || 0))}
                        </td>
                        <td className="px-2 py-1.5">
                          {t ? (
                            <>
                              <div>{fmtDate(t.txn_date)} · {fmtMoney(Number(t.money_in))}</div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">
                                {acct?.account_name} · {t.description || t.reference || "—"}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`px-2 py-1.5 text-right td-num ${s.amount_delta !== null && Math.abs(s.amount_delta) > 0.01 ? "text-amber-500" : ""}`}>
                          {s.amount_delta !== null ? fmtMoney(s.amount_delta) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right td-num">
                          {s.date_delta_days !== null ? `${s.date_delta_days >= 0 ? "+" : ""}${s.date_delta_days}` : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={CONF_STYLE[s.confidence]}>{s.confidence}</span>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground max-w-[300px]">
                          <div className="line-clamp-2">{s.reason}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {matchableCount === 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-2.5 text-xs flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> No matches found. Make sure each merchant has a default bank account and that the bank statement has been imported.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {suggestions.length > 0 && (
            <>
              <Button variant="outline" onClick={run} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Re-run
              </Button>
              <Button onClick={apply} disabled={applying || selectedCount === 0}>
                {applying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying…</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Apply {selectedCount} match{selectedCount === 1 ? "" : "es"}</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
