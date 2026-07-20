import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useHRData } from "@/hooks/useHRData";
import { PayrollTab } from "@/components/hr/PayrollTab";
import { PageHeader, TableSkeleton } from "@/components/expenses/shared";

export default function HRPayroll() {
  const hr = useHRData();
  const [searchParams] = useSearchParams();
  const yearParam = Number(searchParams.get("year"));
  const monthParam = Number(searchParams.get("month"));
  const initialYear = Number.isFinite(yearParam) && yearParam > 0 ? yearParam : undefined;
  const initialMonth = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : undefined;

  useEffect(() => {
    const h = () => hr.refetch();
    window.addEventListener("hr-data-refresh", h);
    return () => window.removeEventListener("hr-data-refresh", h);
  }, [hr]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title="Payroll"
          description="Compute monthly gross, MPF, and net; post accruals and settlements straight to the ledger."
        />
        <Link
          to="/hr/payroll/payables"
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:border-primary hover:text-primary transition-colors"
        >
          View Payroll Payables →
        </Link>
      </div>
      {hr.loading ? (
        <TableSkeleton rows={10} cols={10} />
      ) : (
        <PayrollTab
          payroll={hr.payroll}
          employees={hr.employees}
          shifts={hr.shifts}
          departments={hr.departments}
          onSave={hr.upsertPayroll}
          onSaveBatch={hr.upsertPayrollBatch}
          onCreateEmployee={hr.createEmployee}
          initialYear={initialYear}
          initialMonth={initialMonth}
        />
      )}
    </div>
  );
}
