

## Plan: Separate HR Sidebar Section

The plan from our previous discussion is solid. Here's the refined version:

### Changes

**1. Four new page files** under `src/pages/hr/`:
- `HREmployees.tsx` — wraps `EmployeeDirectoryTab`
- `HRSchedule.tsx` — wraps `AttendanceTab`
- `HRLeave.tsx` — wraps `LeaveManagementTab`
- `HRPayroll.tsx` — wraps `PayrollTab`

Each page calls `useHRData()` and renders its section with a consistent page header.

**2. Sidebar (`AppSidebar.tsx`)** — New "Human Resources" group between Navigation and Admin:

```text
── Navigation ──
  Revenue
  Forecast vs Actual
  Activity Log
  P&L Report
  Invoices
  Inventory

── Human Resources ──
  Employee Directory    /hr/employees
  Schedule              /hr/schedule
  Leave Management      /hr/leave
  Payroll               /hr/payroll

── Admin ──
  User Access
  Settings
```

Visible to admins only (same as current HR access).

**3. Routes (`App.tsx`)** — Replace single `/hr` with four `AdminRoute`-protected sub-routes. Add a redirect from `/hr` → `/hr/employees`.

**4. Cleanup** — Remove old `HumanResources.tsx` tabs page.

### Notes
- Each sub-page reuses `useHRData()` — simple and consistent with current patterns.
- No database changes needed.
- Icons: `Users` for Directory, `Calendar` for Schedule, `FileText` for Leave, `DollarSign` for Payroll.

Ready to implement on your approval.

