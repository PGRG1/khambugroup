import { useHRData } from "@/hooks/useHRData";
import { EmployeeDirectoryTab } from "@/components/hr/EmployeeDirectoryTab";

export default function HREmployees() {
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
        <h1 className="text-2xl font-bold font-display">Employee Directory</h1>
        <p className="text-sm text-muted-foreground">Manage employee records and departments</p>
      </div>
      <EmployeeDirectoryTab
        employees={hr.employees}
        departments={hr.departments}
        onSave={hr.upsertEmployee}
        onSaveDepartment={hr.upsertDepartment}
      />
    </div>
  );
}
