import { useBankModule } from "@/hooks/useBankModule";
import { SettlementBatchesTab } from "@/components/finance/payments/SettlementBatchesTab";
import { PageHeader, ProcessorSelector, useProcessorContext } from "./_shared";

export default function PaymentsBatchesPage() {
  const {
    processors, processorId, setProcessorId, feeRateCountByProcessor,
    processor, procMerchants, procBatches, procLines, procTxns, reload,
  } = useProcessorContext();
  const { accounts: bankAccounts, transactions: bankTxns } = useBankModule();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Settlement Batches"
        subtitle="Parsed settlement batches per processor."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />
      <SettlementBatchesTab
        processor={processor}
        merchants={procMerchants}
        batches={procBatches}
        lines={procLines}
        transactions={procTxns}
        bankTxns={bankTxns}
        bankAccounts={bankAccounts}
        onReload={reload}
      />
    </div>
  );
}
