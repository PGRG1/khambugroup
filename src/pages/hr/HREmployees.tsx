import { useHRData } from "@/hooks/useHRData";
import { EmployeeDirectoryTab } from "@/components/hr/EmployeeDirectoryTab";
import { PageHeader, TableSkeleton } from "@/components/expenses/shared";

export default function HREmployees() {
  const hr = useHRData();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Employee Directory"
        description={`${hr.employees.filter((e) => e.status === "active").length} active · ${hr.employees.length} total`}
      />
      {hr.loading ? (
        <TableSkeleton rows={10} cols={7} />
      ) : (
        <EmployeeDirectoryTab
          employees={hr.employees}
          departments={hr.departments}
          onSave={hr.upsertEmployee}
          onSaveDepartment={hr.upsertDepartment}
        />
      )}
    </div>
  );
}
