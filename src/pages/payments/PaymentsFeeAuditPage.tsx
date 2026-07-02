import { SettlementDetailsAuditTab } from "@/components/finance/payments/SettlementDetailsAuditTab";
import { PageHeader, ProcessorSelector, useProcessorContext } from "./_shared";

export default function PaymentsFeeAuditPage() {
  const {
    processors, processorId, setProcessorId, feeRateCountByProcessor,
    processor, procMerchants, procBatches, procTxns,
  } = useProcessorContext();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fee Audit"
        subtitle="Line-level fee verification for settlement batches."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />
      <SettlementDetailsAuditTab
        processor={processor}
        merchants={procMerchants}
        batches={procBatches}
        transactions={procTxns}
      />
    </div>
  );
}
