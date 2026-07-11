import { useHRData } from "@/hooks/useHRData";
import { LeaveManagementTab } from "@/components/hr/LeaveManagementTab";
import { PageHeader, TableSkeleton } from "@/components/expenses/shared";

export default function HRLeave() {
  const hr = useHRData();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leave Management"
        description="Approve requests, track balances, and monitor cross-venue leave coverage."
      />
      {hr.loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : (
        <LeaveManagementTab
          leaveRequests={hr.leaveRequests}
          leaveTypes={hr.leaveTypes}
          leaveBalances={hr.leaveBalances}
          employees={hr.employees}
          leaveLedger={hr.leaveLedger}
          onSaveRequest={hr.upsertLeaveRequest}
          onSaveType={hr.upsertLeaveType}
          onSaveBalance={hr.upsertLeaveBalance}
          onSaveLedger={hr.upsertLeaveLedger}
          onDeleteLedger={hr.deleteLeaveLedger}
        />
      )}
    </div>
  );
}
