import { useHRData } from "@/hooks/useHRData";
import { AttendanceTab } from "@/components/hr/AttendanceTab";
import { PageHeader } from "@/components/expenses/shared";
import { TableSkeleton } from "@/components/expenses/shared";

export default function HRSchedule() {
  const hr = useHRData();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Schedule"
        description="Plan shifts, review today's board, and track roster vs actuals across every venue."
      />
      {hr.loading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : (
        <AttendanceTab
          shifts={hr.shifts}
          attendance={hr.attendance}
          employees={hr.employees}
          departments={hr.departments}
          leaveRequests={hr.leaveRequests}
          leaveTypes={hr.leaveTypes}
          holidays={hr.holidays}
          onSaveShift={hr.upsertShift}
          onSaveAttendance={hr.upsertAttendance}
          onSaveLeaveRequest={hr.upsertLeaveRequest}
          onRefetch={hr.refetch}
        />
      )}
    </div>
  );
}
