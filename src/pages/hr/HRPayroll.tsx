import { useEffect } from "react";
import { useHRData } from "@/hooks/useHRData";
import { PayrollTab } from "@/components/hr/PayrollTab";
import { PageHeader, TableSkeleton } from "@/components/expenses/shared";

export default function HRPayroll() {
  const hr = useHRData();
  useEffect(() => {
    const h = () => hr.refetch();
    window.addEventListener("hr-data-refresh", h);
    return () => window.removeEventListener("hr-data-refresh", h);
  }, [hr]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payroll"
        description="Compute monthly gross, MPF, and net; post accruals and settlements straight to the ledger."
      />
      {hr.loading ? (
        <TableSkeleton rows={10} cols={10} />
      ) : (
        <PayrollTab
          payroll={hr.payroll}
          employees={hr.employees}
          shifts={hr.shifts}
          onSave={hr.upsertPayroll}
        />
      )}
    </div>
  );
}
