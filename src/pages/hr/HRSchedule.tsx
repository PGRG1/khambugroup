import { usePeopleSettings } from "@/hooks/usePeopleSettings";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useHRData } from "@/hooks/useHRData";
import { AttendanceTab } from "@/components/hr/AttendanceTab";
import { PageHeader } from "@/components/expenses/shared";
import { TableSkeleton } from "@/components/expenses/shared";

export default function HRSchedule() {
  const hr = useHRData();
  const settings=usePeopleSettings();const scope=useVenueScope();
  const enabled=scope.venues.some(v=>scope.includesId(v.id)&&settings.forVenue(v.id).rota);
  if(!settings.loading&&!enabled)return <div className="p-6"><h1 className="text-2xl font-display">Rota & hours</h1><p className="text-muted-foreground">Rota is switched off for these venues.</p></div>;

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
          leaveRequests={hr.leaveRequests.filter(r=>{const e=hr.employees.find(e=>e.id===r.employee_id);return settings.forVenue((e as any)?.venue_id).leave_requests;})}
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
