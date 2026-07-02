import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentSettlements } from "@/hooks/usePaymentSettlements";

export const ALL = "__all__";

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Each Payments page owns its OWN processor selector state.
 * On first load, default to KPay if present, else the first processor.
 */
export function useProcessorContext() {
  const data = usePaymentSettlements();
  const { processors, batches, lines, transactions, merchants, imports, feeRates } = data;

  const [processorId, setProcessorId] = useState<string>(ALL);
  const [didInit, setDidInit] = useState(false);
  useEffect(() => {
    if (didInit || !processors.length) return;
    const kpay = processors.find((p) => /kpay/i.test(p.name)) || processors[0];
    if (kpay) setProcessorId(kpay.id);
    setDidInit(true);
  }, [processors, didInit]);

  const isAll = processorId === ALL;
  const processor = useMemo(
    () => (isAll ? null : processors.find((p) => p.id === processorId) || null),
    [processors, processorId, isAll],
  );

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
    batches.forEach((b) => {
      if (b.status === "unmatched") m.set(b.processor_id, (m.get(b.processor_id) || 0) + 1);
    });
    return m;
  }, [batches]);

  const procBatches = useMemo(
    () => (isAll ? batches : processor ? batches.filter((b) => b.processor_id === processor.id) : []),
    [batches, processor, isAll],
  );
  const procBatchIds = useMemo(() => new Set(procBatches.map((b) => b.id)), [procBatches]);
  const procLines = useMemo(() => lines.filter((l) => procBatchIds.has(l.batch_id)), [lines, procBatchIds]);
  const procTxns = useMemo(
    () => transactions.filter((t) => procBatchIds.has(t.batch_id)),
    [transactions, procBatchIds],
  );
  const procMerchants = isAll ? merchants : processor ? merchants.filter((m) => m.processor_id === processor.id) : [];

  return {
    ...data,
    processorId,
    setProcessorId,
    processor,
    isAll,
    procBatches,
    procLines,
    procTxns,
    procMerchants,
    feeRateCountByProcessor,
    merchantCountByProcessor,
    lastImportByProcessor,
    unmatchedByProcessor,
  };
}

export function ProcessorSelector({
  processors,
  processorId,
  setProcessorId,
  feeRateCountByProcessor,
}: {
  processors: { id: string; name: string }[];
  processorId: string;
  setProcessorId: (v: string) => void;
  feeRateCountByProcessor: Map<string, number>;
}) {
  return (
    <Select value={processorId} onValueChange={setProcessorId}>
      <SelectTrigger className="w-[260px]">
        <SelectValue placeholder="Choose processor" />
      </SelectTrigger>
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
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card className="card-glass p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold td-num mt-1 ${valueClass || ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
