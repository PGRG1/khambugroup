import { useHRData } from "@/hooks/useHRData";
import { AttendanceTab } from "@/components/hr/AttendanceTab";

export default function HRSchedule() {
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
        <h1 className="text-2xl font-bold font-display">Schedule Management</h1>
        <p className="text-sm text-muted-foreground">Plan shifts, track attendance, and manage weekly rosters</p>
      </div>
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
    </div>
  );
}
