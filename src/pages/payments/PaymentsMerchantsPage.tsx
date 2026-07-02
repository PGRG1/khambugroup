import { useBankModule } from "@/hooks/useBankModule";
import { MerchantsTab } from "@/components/finance/payments/MerchantsTab";
import { PageHeader, ProcessorSelector, useProcessorContext } from "./_shared";

export default function PaymentsMerchantsPage() {
  const {
    processors, processorId, setProcessorId, feeRateCountByProcessor,
    processor, merchants, reload,
  } = useProcessorContext();
  const { accounts: bankAccounts } = useBankModule();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Merchants"
        subtitle="Merchant accounts per payment processor."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />
      <MerchantsTab
        processor={processor}
        merchants={merchants}
        bankAccounts={bankAccounts}
        onChanged={reload}
      />
    </div>
  );
}
