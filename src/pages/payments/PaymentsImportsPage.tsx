import { ImportsTab } from "@/components/finance/payments/ImportsTab";
import { PageHeader, ProcessorSelector, useProcessorContext } from "./_shared";

export default function PaymentsImportsPage() {
  const {
    tenantId, processors, processorId, setProcessorId, feeRateCountByProcessor,
    processor, imports, merchants, reload,
  } = useProcessorContext();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Imports"
        subtitle="Upload and manage settlement statements."
        right={
          <ProcessorSelector
            processors={processors}
            processorId={processorId}
            setProcessorId={setProcessorId}
            feeRateCountByProcessor={feeRateCountByProcessor}
          />
        }
      />
      <ImportsTab
        processor={processor}
        imports={imports}
        merchants={merchants}
        tenantId={tenantId}
        onChanged={reload}
      />
    </div>
  );
}
