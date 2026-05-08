import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CreditCard, Receipt, ListChecks, FileText } from "lucide-react";
import { usePaymentSettlements } from "@/hooks/usePaymentSettlements";
import { useBankReconciliation } from "@/hooks/useBankReconciliation";
import { formatCurrency } from "@/utils/salesUtils";
import { MerchantsTab } from "@/components/finance/payments/MerchantsTab";
import { ImportsTab } from "@/components/finance/payments/ImportsTab";
import { FeeRatesTab } from "@/components/finance/payments/FeeRatesTab";
import { SettlementDetailsAuditTab } from "@/components/finance/payments/SettlementDetailsAuditTab";
import { MonthlyReconciliationTab } from "@/components/finance/payments/MonthlyReconciliationTab";

export default function PaymentsSettlements() {
  const { loading, processors, merchants, imports, batches, lines, reload } = usePaymentSettlements();
  const { accounts: bankAccounts } = useBankReconciliation();
  const [processorId, setProcessorId] = useState<string>("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!processorId && processors.length > 0) setProcessorId(processors[0].id);
  }, [processors, processorId]);

  const processor = useMemo(() => processors.find((p) => p.id === processorId) || null, [processors, processorId]);

  const procBatches = useMemo(
    () => (processor ? batches.filter((b) => b.processor_id === processor.id) : []),
    [batches, processor],
  );
  const procImports = useMemo(
    () => (processor ? imports.filter((i) => i.processor_id === processor.id) : []),
    [imports, processor],
  );
  const procBatchIds = useMemo(() => new Set(procBatches.map((b) => b.id)), [procBatches]);
  const procLines = useMemo(() => lines.filter((l) => procBatchIds.has(l.batch_id)), [lines, procBatchIds]);

  const totalGross = procBatches.reduce((s, b) => s + Number(b.gross_amount || 0), 0);
  const totalFees = procBatches.reduce((s, b) => s + Math.abs(Number(b.fee_amount || 0)) + Math.abs(Number(b.bank_transfer_fee || 0)), 0);
  const totalNet = procBatches.reduce((s, b) => s + Number(b.net_settlement || 0), 0);
  const unmatched = procBatches.filter((b) => b.status === "unmatched").length;
  const procMerchants = processor ? merchants.filter((m) => m.processor_id === processor.id) : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Payments & Settlements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ingest settlement statements from card processors (KPay, Stripe, PayMe…), reconcile against bank deposits and POS sales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={processorId} onValueChange={setProcessorId}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Choose processor" /></SelectTrigger>
            <SelectContent>
              {processors.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Receipt className="h-4 w-4" />} label="Gross transactions" value={formatCurrency(totalGross)} sub={`${procBatches.length} batches`} />
        <KpiCard icon={<CreditCard className="h-4 w-4" />} label="Total fees" value={formatCurrency(totalFees)} sub="Processor + bank transfer" />
        <KpiCard icon={<Building2 className="h-4 w-4" />} label="Net settled" value={formatCurrency(totalNet)} sub="To bank accounts" />
        <KpiCard icon={<ListChecks className="h-4 w-4" />} label="Unmatched batches" value={String(unmatched)} sub="Need bank match" tone={unmatched > 0 ? "warn" : "ok"} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="batches">Settlement Batches</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="imports">Imports</TabsTrigger>
          <TabsTrigger value="fee-rates">Fee Rates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="card-glass p-6">
            <h3 className="text-sm font-medium mb-2">How this works</h3>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
              <li>Set up your <b>Merchants</b> (one per merchant number) and link each to a venue and the bank account that receives the settlement.</li>
              <li>Upload monthly settlement reports under <b>Imports</b>.</li>
              <li>Phase 2 (next): an AI parser will extract per-day, per-card-type lines and create <b>Settlement batches</b>, each ready to match a bank deposit.</li>
              <li>Phase 3 (next): each batch's net amount auto-matches a deposit on Bank Reconciliation; gross by venue/payment-type reconciles against POS sales.</li>
            </ol>

            <div className="mt-6">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Configured merchants</h4>
              {procMerchants.length === 0 ? (
                <p className="text-xs text-muted-foreground">No merchants for this processor yet.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {procMerchants.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
                      <span><span className="font-mono text-xs text-muted-foreground mr-2">{m.merchant_number}</span>{m.display_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.shared_venues.length > 0 ? m.shared_venues.join(" + ") : (m.venue || "—")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <Card className="card-glass p-6 text-center text-sm text-muted-foreground">
            <FileText className="h-6 w-6 mx-auto mb-2 text-primary/70" />
            Settlement batches will appear here once the parser (Phase 2) is enabled and you upload a report.
          </Card>
        </TabsContent>

        <TabsContent value="merchants" className="mt-4">
          <MerchantsTab processor={processor} merchants={merchants} bankAccounts={bankAccounts} onChanged={reload} />
        </TabsContent>

        <TabsContent value="imports" className="mt-4">
          <ImportsTab processor={processor} imports={imports} merchants={merchants} onChanged={reload} />
        </TabsContent>

        <TabsContent value="fee-rates" className="mt-4">
          <FeeRatesTab processor={processor} merchants={procMerchants} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <Card className="card-glass p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={tone === "warn" ? "text-amber-400" : "text-primary"}>{icon}</span>
      </div>
      <div className="td-num text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
