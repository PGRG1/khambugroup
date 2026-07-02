import { MonthlyReconciliationTab } from "@/components/finance/payments/MonthlyReconciliationTab";
import { PageHeader, ProcessorSelector, useProcessorContext } from "./_shared";

export default function PaymentsMonthlyPage() {
  const {
    processors, processorId, setProcessorId, feeRateCountByProcessor,
    processor, procMerchants, procBatches, procLines,
  } = useProcessorContext();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Monthly Check"
        subtitle="Month-end reconciliation against settlements."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />
      <MonthlyReconciliationTab
        processor={processor}
        merchants={procMerchants}
        batches={procBatches}
        lines={procLines}
      />
    </div>
  );
}
