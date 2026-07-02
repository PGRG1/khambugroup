import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/salesUtils";
import { PageHeader, ProcessorSelector, KpiCard, useProcessorContext, fmtDate } from "./_shared";
import type { PaymentProcessor } from "@/hooks/usePaymentSettlements";

export default function PaymentsDashboardPage() {
  const ctx = useProcessorContext();
  const {
    processors, batches, procBatches, imports, isAll, processor,
    processorId, setProcessorId,
    feeRateCountByProcessor, merchantCountByProcessor, lastImportByProcessor, unmatchedByProcessor,
  } = ctx;
  const navigate = useNavigate();

  const totalGross = procBatches.reduce((s, b) => s + Number(b.gross_amount || 0), 0);
  const totalFees = procBatches.reduce(
    (s, b) => s + Math.abs(Number(b.fee_amount || 0)) + Math.abs(Number(b.bank_transfer_fee || 0)),
    0,
  );
  const totalNet = procBatches.reduce((s, b) => s + Number(b.net_settlement || 0), 0);
  const unmatched = procBatches.filter((b) => b.status === "unmatched").length;

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
      <PageHeader
        title="Payments & Settlements"
        subtitle="Settlement statements, fee verification, and bank matching."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />

      <Stepper active={activeStep} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gross transactions" value={formatCurrency(totalGross)} sub={`${procBatches.length} batches`} />
        <KpiCard label="Total fees" value={formatCurrency(totalFees)} sub="Processor + bank transfer" />
        <KpiCard label="Net settled" value={formatCurrency(totalNet)} sub="To bank accounts" />
        <KpiCard
          label="Unmatched batches"
          value={String(unmatched)}
          sub="Need bank match"
          valueClass={unmatched > 0 ? "text-amber-400" : "text-emerald-400"}
        />
      </div>

      <OverviewPanel
        processors={processors}
        batches={batches}
        merchantCountByProcessor={merchantCountByProcessor}
        feeRateCountByProcessor={feeRateCountByProcessor}
        lastImportByProcessor={lastImportByProcessor}
        unmatchedByProcessor={unmatchedByProcessor}
        onOpenProcessor={(id) => { setProcessorId(id); navigate("/payments/batches"); }}
        onGotoBatches={() => navigate("/payments/batches")}
        onGotoProcessors={() => navigate("/payments/processors")}
      />
    </div>
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
