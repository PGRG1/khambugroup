import { useHRData } from "@/hooks/useHRData";
import { LeaveManagementTab } from "@/components/hr/LeaveManagementTab";

export default function HRLeave() {
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
        <h1 className="text-2xl font-bold font-display">Leave Management</h1>
        <p className="text-sm text-muted-foreground">Track leave requests, balances, and leave types</p>
      </div>
      <LeaveManagementTab
        leaveRequests={hr.leaveRequests}
        leaveTypes={hr.leaveTypes}
        leaveBalances={hr.leaveBalances}
        employees={hr.employees}
        onSaveRequest={hr.upsertLeaveRequest}
        onSaveType={hr.upsertLeaveType}
        onSaveBalance={hr.upsertLeaveBalance}
      />
    </div>
  );
}
