import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PaymentProcessor, ProcessorMerchant, SettlementBatch, SettlementLine } from "@/hooks/usePaymentSettlements";
import { formatCurrency as fmtMoney } from "@/utils/salesUtils";

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const RECON_STYLE: Record<string, string> = {
  ok: "chip chip-success",
  off: "chip chip-warn",
  missing_details: "chip chip-danger",
};
const RECON_LABEL: Record<string, string> = {
  ok: "OK",
  off: "Off",
  missing_details: "Missing details",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function MonthlyReconciliationTab({
  processor, merchants, batches, lines,
}: {
  processor: PaymentProcessor | null;
  merchants: ProcessorMerchant[];
  batches: SettlementBatch[];
  lines: SettlementLine[];
}) {
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

  const rows = useMemo(() => {
    const sorted = [...batches].sort((a, b) =>
      b.settlement_date.localeCompare(a.settlement_date) ||
      b.transaction_date.localeCompare(a.transaction_date),
    );
    return sorted.map((b) => {
      const bLines = linesByBatch.get(b.id) || [];
      const details_count = bLines.reduce((s, l) => s + Number(l.count || 0), 0);
      const details_net = round2(bLines.reduce((s, l) => s + Number(l.net_amount || 0), 0));
      const settlement_fee = Number(b.bank_transfer_fee || 0);
      const adjustments = Number(b.adjustments || 0);
      const points_offset = Number(b.points_offset || 0);
      const frozen_amount = Number(b.frozen_amount || 0);
      const monthly_net = Number(b.net_settlement || 0);
      const expected_net = round2(details_net + adjustments + points_offset - settlement_fee - frozen_amount);
      const variance = round2(monthly_net - expected_net);
      const status = bLines.length === 0 ? "missing_details" : Math.abs(variance) <= 0.01 ? "ok" : "off";
      return {
        batch: b,
        merchantLabel: merchantById.get(b.merchant_id)?.display_name || "?",
        details_count,
        details_net,
        settlement_fee,
        adjustments,
        points_offset,
        frozen_amount,
        monthly_net,
        expected_net,
        variance,
        status,
      };
    });
  }, [batches, linesByBatch, merchantById]);

  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.gross += Number(r.batch.gross_amount || 0);
    acc.net += r.monthly_net;
    acc.settlementFee += r.settlement_fee;
    acc.variance += r.variance;
    if (r.status !== "ok") acc.off += 1;
    return acc;
  }, { gross: 0, net: 0, settlementFee: 0, variance: 0, off: 0 }), [rows]);

  if (!processor) return <Card className="card-glass p-6 text-sm text-muted-foreground">Choose a processor.</Card>;
  if (rows.length === 0)
    return <Card className="card-glass p-6 text-sm text-muted-foreground text-center">No settlement batches imported yet.</Card>;

  const ok = totals.off === 0;

  return (
    <Card className="card-glass p-4 space-y-3">
      {ok ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 p-2.5 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> All batches reconcile to the Settlement details (HK$1 settlement fee accounted for).
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-2.5 text-xs flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> {totals.off} batch(es) don't reconcile. Net Δ {fmtMoney(totals.variance)}.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Batches" value={String(rows.length)} />
        <Stat label="Gross" value={fmtMoney(totals.gross)} />
        <Stat label="Net settled" value={fmtMoney(totals.net)} />
        <Stat label="Settlement fees" value={fmtMoney(totals.settlementFee)} />
        <Stat label="Recon Δ" value={fmtMoney(totals.variance)} tone={Math.abs(totals.variance) > 0.01 ? "warn" : "ok"} />
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
            {rows.map((r) => {
              const off = r.status !== "ok";
              const adjBlock = r.adjustments + r.points_offset - r.frozen_amount;
              return (
                <tr key={r.batch.id} className={`border-t border-border/40 ${off ? "bg-amber-500/5" : ""}`}>
                  <td className="px-2 py-1.5">{fmtDate(r.batch.settlement_date)}</td>
                  <td className="px-2 py-1.5">{fmtDate(r.batch.transaction_date)}</td>
                  <td className="px-2 py-1.5 font-medium">{r.merchantLabel}</td>
                  <td className="px-2 py-1.5 text-right td-num">{r.details_count}</td>
                  <td className="px-2 py-1.5 text-right td-num">{fmtMoney(r.details_net)}</td>
                  <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(-r.settlement_fee)}</td>
                  <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(adjBlock)}</td>
                  <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(r.expected_net)}</td>
                  <td className="px-2 py-1.5 text-right td-num font-medium">{fmtMoney(r.monthly_net)}</td>
                  <td className={`px-2 py-1.5 text-right td-num ${Math.abs(r.variance) > 0.01 ? "text-amber-500 font-medium" : ""}`}>{fmtMoney(r.variance)}</td>
                  <td className="px-2 py-1.5"><span className={RECON_STYLE[r.status]}>{RECON_LABEL[r.status]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
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
