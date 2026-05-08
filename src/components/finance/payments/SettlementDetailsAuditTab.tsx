import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PaymentProcessor, ProcessorMerchant, SettlementBatch, SettlementLine } from "@/hooks/usePaymentSettlements";
import { formatCurrency as fmtMoney } from "@/utils/salesUtils";

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const STATUS_STYLE: Record<string, string> = {
  ok: "chip chip-success",
  rate_off: "chip chip-warn",
  unknown_pm: "chip chip-danger",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  rate_off: "Rate off",
  unknown_pm: "Unknown PM",
};

export function SettlementDetailsAuditTab({
  processor, merchants, batches, lines,
}: {
  processor: PaymentProcessor | null;
  merchants: ProcessorMerchant[];
  batches: SettlementBatch[];
  lines: SettlementLine[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const merchantById = useMemo(() => {
    const m = new Map<string, ProcessorMerchant>();
    merchants.forEach((x) => m.set(x.id, x));
    return m;
  }, [merchants]);

  const linesByBatch = useMemo(() => {
    const m = new Map<string, SettlementLine[]>();
    lines.forEach((l) => {
      const arr = m.get(l.batch_id) || [];
      arr.push(l);
      m.set(l.batch_id, arr);
    });
    return m;
  }, [lines]);

  const sorted = useMemo(
    () => [...batches].sort((a, b) =>
      b.settlement_date.localeCompare(a.settlement_date) ||
      b.transaction_date.localeCompare(a.transaction_date),
    ),
    [batches],
  );

  const totals = useMemo(() => {
    let count = 0, gross = 0, actual = 0, expected = 0, flagged = 0;
    sorted.forEach((b) => {
      (linesByBatch.get(b.id) || []).forEach((l) => {
        count += Number(l.count || 0);
        gross += Number(l.gross_amount || 0);
        actual += Number(l.fee_amount || 0);
        expected += Number(l.expected_fee || 0);
      });
      flagged += Number(b.transactions_flagged || 0);
    });
    return { count, gross, actual, expected, variance: actual - expected, flagged };
  }, [sorted, linesByBatch]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  if (!processor) return <Card className="card-glass p-6 text-sm text-muted-foreground">Choose a processor.</Card>;

  if (sorted.length === 0)
    return <Card className="card-glass p-6 text-sm text-muted-foreground text-center">No settlement batches imported yet.</Card>;

  const ok = totals.flagged === 0 && Math.abs(totals.variance) <= 0.01;

  return (
    <Card className="card-glass p-4 space-y-3">
      {ok ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 p-2.5 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Per-transaction fees match the contracted Fee Rates exactly across all imported batches.
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-2.5 text-xs flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {totals.flagged} transaction(s) flagged. Net Δ {fmtMoney(totals.variance)}.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Transactions" value={String(totals.count)} />
        <Stat label="Gross" value={fmtMoney(totals.gross)} />
        <Stat label="Expected fee" value={fmtMoney(totals.expected)} />
        <Stat label="Actual fee" value={fmtMoney(totals.actual)} />
        <Stat label="Δ" value={fmtMoney(totals.variance)} tone={Math.abs(totals.variance) > 0.01 ? "warn" : "ok"} />
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
              <th className="text-left px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const bLines = linesByBatch.get(b.id) || [];
              const merchant = merchantById.get(b.merchant_id);
              const expected = bLines.reduce((s, l) => s + Number(l.expected_fee || 0), 0);
              const isOpen = expanded.has(b.id);
              const flagged = b.audit_status !== "ok";
              const status = (b.audit_status || "ok") as keyof typeof STATUS_STYLE;
              return (
                <FragmentRow
                  key={b.id}
                  isOpen={isOpen}
                  onToggle={() => toggle(b.id)}
                  flagged={flagged}
                  batch={b}
                  bLines={bLines}
                  merchantLabel={merchant?.display_name || "?"}
                  expected={expected}
                  status={status}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FragmentRow({
  isOpen, onToggle, flagged, batch, bLines, merchantLabel, expected, status,
}: {
  isOpen: boolean; onToggle: () => void; flagged: boolean;
  batch: SettlementBatch; bLines: SettlementLine[];
  merchantLabel: string; expected: number; status: string;
}) {
  const count = bLines.reduce((s, l) => s + Number(l.count || 0), 0);
  const gross = bLines.reduce((s, l) => s + Number(l.gross_amount || 0), 0);
  const actual = bLines.reduce((s, l) => s + Number(l.fee_amount || 0), 0);
  const variance = actual - expected;
  return (
    <>
      <tr
        className={`border-t border-border/40 cursor-pointer hover:bg-muted/30 ${flagged ? "bg-amber-500/5" : ""}`}
        onClick={onToggle}
      >
        <td className="px-1 text-muted-foreground">{isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</td>
        <td className="px-2 py-1.5">{fmtDate(batch.settlement_date)}</td>
        <td className="px-2 py-1.5">{fmtDate(batch.transaction_date)}</td>
        <td className="px-2 py-1.5 font-medium">{merchantLabel}</td>
        <td className="px-2 py-1.5 text-right td-num">{count}</td>
        <td className="px-2 py-1.5 text-right td-num">{fmtMoney(gross)}</td>
        <td className="px-2 py-1.5 text-right td-num">{fmtMoney(actual)}</td>
        <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(expected)}</td>
        <td className={`px-2 py-1.5 text-right td-num ${Math.abs(variance) > 0.01 ? "text-amber-500 font-medium" : ""}`}>{fmtMoney(variance)}</td>
        <td className="px-2 py-1.5">
          <span className={STATUS_STYLE[status] || STATUS_STYLE.ok}>{STATUS_LABEL[status] || status}{batch.transactions_flagged > 0 ? ` · ${batch.transactions_flagged}` : ""}</span>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/10">
          <td></td>
          <td colSpan={9} className="px-2 py-2">
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
                {bLines.map((l) => (
                  <tr key={l.id} className="border-t border-border/20">
                    <td className="py-1">{l.payment_type_label}</td>
                    <td className="py-1 text-right td-num">{l.count}</td>
                    <td className="py-1 text-right td-num">{fmtMoney(l.gross_amount)}</td>
                    <td className="py-1 text-right td-num">{fmtMoney(l.fee_amount)}</td>
                    <td className="py-1 text-right td-num text-muted-foreground">{fmtMoney(l.expected_fee)}</td>
                    <td className={`py-1 text-right td-num ${Math.abs(Number(l.fee_variance)) > 0.01 ? "text-amber-500 font-medium" : ""}`}>{fmtMoney(l.fee_variance)}</td>
                    <td className="py-1 pl-3"><span className={STATUS_STYLE[l.audit_status] || STATUS_STYLE.ok}>{STATUS_LABEL[l.audit_status] || l.audit_status}</span></td>
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
