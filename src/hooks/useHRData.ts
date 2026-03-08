import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Types
export interface HRDepartment {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface HREmployee {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  hire_date: string;
  end_date: string | null;
  department_id: string | null;
  job_title: string | null;
  employment_type: string;
  status: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  venue: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  department?: HRDepartment;
}

export interface HRLeaveType {
  id: string;
  name: string;
  default_days_per_year: number;
  is_paid: boolean;
  is_active: boolean;
}

export interface HRLeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
  leave_type?: HRLeaveType;
}

export interface HRLeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  employee?: HREmployee;
  leave_type?: HRLeaveType;
}

export interface HRShift {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  notes: string | null;
  status: string;
  shift_type: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_break_minutes: number;
  actual_hours_worked: number | null;
  variance_minutes: number;
  no_show: boolean;
  employee?: HREmployee;
}

export interface HRAttendance {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  hours_worked: number | null;
  overtime_hours: number | null;
  status: string;
  notes: string | null;
  employee?: HREmployee;
}

export interface HRPayroll {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  forecast_base_salary: number;
  forecast_allowances: number;
  forecast_deductions: number;
  forecast_overtime: number;
  forecast_bonus: number;
  forecast_total: number;
  actual_base_salary: number | null;
  actual_allowances: number | null;
  actual_deductions: number | null;
  actual_overtime: number | null;
  actual_bonus: number | null;
  actual_total: number | null;
  annual_leave_pay: number;
  statutory_holiday_pay: number;
  other_payments: number;
  other_payments_note: string | null;
  mpf_employee: number;
  mpf_employer: number;
  sick_leave_deduction: number;
  unpaid_leave_deduction: number;
  other_deductions: number;
  other_deductions_note: string | null;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  net_salary_payment_date: string | null;
  mpf_payment_amount: number;
  mpf_payment_date: string | null;
  payment_method: string;
  payment_status: string;
  payment_date: string | null;
  notes: string | null;
  employee?: HREmployee;
}

export function useHRData() {
  const [departments, setDepartments] = useState<HRDepartment[]>([]);
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HRLeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<HRLeaveRequest[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<HRLeaveBalance[]>([]);
  const [shifts, setShifts] = useState<HRShift[]>([]);
  const [attendance, setAttendance] = useState<HRAttendance[]>([]);
  const [payroll, setPayroll] = useState<HRPayroll[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase.from("hr_departments").select("*").order("name");
    if (data) setDepartments(data);
  }, []);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from("hr_employees").select("*, department:hr_departments(*)").order("first_name");
    if (data) setEmployees(data as any);
  }, []);

  const fetchLeaveTypes = useCallback(async () => {
    const { data } = await supabase.from("hr_leave_types").select("*").order("name");
    if (data) setLeaveTypes(data);
  }, []);

  const fetchLeaveRequests = useCallback(async () => {
    const { data } = await supabase.from("hr_leave_requests").select("*, employee:hr_employees(*), leave_type:hr_leave_types(*)").order("created_at", { ascending: false });
    if (data) setLeaveRequests(data as any);
  }, []);

  const fetchLeaveBalances = useCallback(async () => {
    const { data } = await supabase.from("hr_leave_balances").select("*, leave_type:hr_leave_types(*)").order("year", { ascending: false });
    if (data) setLeaveBalances(data as any);
  }, []);

  const fetchShifts = useCallback(async () => {
    const { data } = await supabase.from("hr_shifts").select("*, employee:hr_employees(*)").order("shift_date", { ascending: false });
    if (data) setShifts(data as any);
  }, []);

  const fetchAttendance = useCallback(async () => {
    const { data } = await supabase.from("hr_attendance").select("*, employee:hr_employees(*)").order("date", { ascending: false });
    if (data) setAttendance(data as any);
  }, []);

  const fetchPayroll = useCallback(async () => {
    const { data } = await supabase.from("hr_payroll").select("*, employee:hr_employees(*)").order("year", { ascending: false }).order("month", { ascending: false });
    if (data) setPayroll(data as any);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchDepartments(), fetchEmployees(), fetchLeaveTypes(),
      fetchLeaveRequests(), fetchLeaveBalances(), fetchShifts(),
      fetchAttendance(), fetchPayroll(),
    ]);
    setLoading(false);
  }, [fetchDepartments, fetchEmployees, fetchLeaveTypes, fetchLeaveRequests, fetchLeaveBalances, fetchShifts, fetchAttendance, fetchPayroll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // CRUD helpers
  const upsertDepartment = async (dept: Partial<HRDepartment>) => {
    const { error } = dept.id
      ? await supabase.from("hr_departments").update(dept).eq("id", dept.id)
      : await supabase.from("hr_departments").insert(dept as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchDepartments();
    return true;
  };

  const upsertEmployee = async (emp: Partial<HREmployee>) => {
    const payload = { ...emp };
    delete (payload as any).department;
    const { error } = emp.id
      ? await supabase.from("hr_employees").update(payload).eq("id", emp.id)
      : await supabase.from("hr_employees").insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchEmployees();
    return true;
  };

  const upsertLeaveType = async (lt: Partial<HRLeaveType>) => {
    const { error } = lt.id
      ? await supabase.from("hr_leave_types").update(lt).eq("id", lt.id)
      : await supabase.from("hr_leave_types").insert(lt as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchLeaveTypes();
    return true;
  };

  const upsertLeaveRequest = async (lr: Partial<HRLeaveRequest>) => {
    const payload = { ...lr };
    delete (payload as any).employee;
    delete (payload as any).leave_type;
    const { error } = lr.id
      ? await supabase.from("hr_leave_requests").update(payload).eq("id", lr.id)
      : await supabase.from("hr_leave_requests").insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchLeaveRequests();
    return true;
  };

  const upsertLeaveBalance = async (lb: Partial<HRLeaveBalance>) => {
    const payload = { ...lb };
    delete (payload as any).leave_type;
    const { error } = lb.id
      ? await supabase.from("hr_leave_balances").update(payload).eq("id", lb.id)
      : await supabase.from("hr_leave_balances").insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchLeaveBalances();
    return true;
  };

  const upsertShift = async (s: Partial<HRShift>) => {
    const payload = { ...s };
    delete (payload as any).employee;
    const { error } = s.id
      ? await supabase.from("hr_shifts").update(payload).eq("id", s.id)
      : await supabase.from("hr_shifts").insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchShifts();
    return true;
  };

  const upsertAttendance = async (a: Partial<HRAttendance>) => {
    const payload = { ...a };
    delete (payload as any).employee;
    const { error } = a.id
      ? await supabase.from("hr_attendance").update(payload).eq("id", a.id)
      : await supabase.from("hr_attendance").insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAttendance();
    return true;
  };

  const upsertPayroll = async (p: Partial<HRPayroll>) => {
    const payload = { ...p };
    delete (payload as any).employee;
    const { error } = p.id
      ? await supabase.from("hr_payroll").update(payload).eq("id", p.id)
      : await supabase.from("hr_payroll").insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchPayroll();
    return true;
  };

  const deleteRecord = async (table: string, id: string) => {
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  };

  return {
    departments, employees, leaveTypes, leaveRequests, leaveBalances,
    shifts, attendance, payroll, loading,
    upsertDepartment, upsertEmployee, upsertLeaveType, upsertLeaveRequest,
    upsertLeaveBalance, upsertShift, upsertAttendance, upsertPayroll,
    deleteRecord, refetch: fetchAll,
  };
}
