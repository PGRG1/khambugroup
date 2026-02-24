import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHRData } from "@/hooks/useHRData";
import { EmployeeDirectoryTab } from "@/components/hr/EmployeeDirectoryTab";
import { LeaveManagementTab } from "@/components/hr/LeaveManagementTab";
import { AttendanceTab } from "@/components/hr/AttendanceTab";
import { PayrollTab } from "@/components/hr/PayrollTab";

export default function HumanResources() {
  const hr = useHRData();

  if (hr.loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading HR data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Human Resources</h1>
        <p className="text-sm text-muted-foreground">Manage employees, leave, attendance, and payroll</p>
      </div>

      <Tabs defaultValue="directory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="directory">Employees</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="directory">
          <EmployeeDirectoryTab
            employees={hr.employees}
            departments={hr.departments}
            onSave={hr.upsertEmployee}
            onSaveDepartment={hr.upsertDepartment}
          />
        </TabsContent>

        <TabsContent value="leave">
          <LeaveManagementTab
            leaveRequests={hr.leaveRequests}
            leaveTypes={hr.leaveTypes}
            leaveBalances={hr.leaveBalances}
            employees={hr.employees}
            onSaveRequest={hr.upsertLeaveRequest}
            onSaveType={hr.upsertLeaveType}
            onSaveBalance={hr.upsertLeaveBalance}
          />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab
            shifts={hr.shifts}
            attendance={hr.attendance}
            employees={hr.employees}
            onSaveShift={hr.upsertShift}
            onSaveAttendance={hr.upsertAttendance}
          />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollTab
            payroll={hr.payroll}
            employees={hr.employees}
            shifts={hr.shifts}
            onSave={hr.upsertPayroll}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
