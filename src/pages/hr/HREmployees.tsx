import { useHRData } from "@/hooks/useHRData";
import { EmployeeDirectoryTab } from "@/components/hr/EmployeeDirectoryTab";

export default function HREmployees() {
  const hr = useHRData();

  if (hr.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <EmployeeDirectoryTab
        employees={hr.employees}
        departments={hr.departments}
        onSave={hr.upsertEmployee}
        onSaveDepartment={hr.upsertDepartment}
      />
    </div>
  );
}
