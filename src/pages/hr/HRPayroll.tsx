import { useHRData } from "@/hooks/useHRData";
import { PayrollTab } from "@/components/hr/PayrollTab";

export default function HRPayroll() {
  const hr = useHRData();

  if (hr.loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Payroll</h1>
        <p className="text-sm text-muted-foreground">Manage salary, deductions, and payment records</p>
      </div>
      <PayrollTab
        payroll={hr.payroll}
        employees={hr.employees}
        shifts={hr.shifts}
        onSave={hr.upsertPayroll}
      />
    </div>
  );
}
