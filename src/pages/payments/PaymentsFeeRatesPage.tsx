import { FeeRatesTab } from "@/components/finance/payments/FeeRatesTab";
import { PageHeader, ProcessorSelector, useProcessorContext } from "./_shared";

export default function PaymentsFeeRatesPage() {
  const {
    processors, processorId, setProcessorId, feeRateCountByProcessor,
    processor, procMerchants, merchants, feeRates, reload,
  } = useProcessorContext();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fee Rates"
        subtitle="Fee rate rules per processor and merchant."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />
      <FeeRatesTab
        processor={processor}
        merchants={procMerchants}
        allProcessors={processors}
        allMerchants={merchants}
        allFeeRates={feeRates}
        onReload={reload}
      />
    </div>
  );
}
