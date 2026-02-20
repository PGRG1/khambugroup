
-- HR Departments
CREATE TABLE public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read departments" ON public.hr_departments FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage departments" ON public.hr_departments FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Employees
CREATE TABLE public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(user_id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  department_id uuid REFERENCES public.hr_departments(id),
  job_title text,
  employment_type text NOT NULL DEFAULT 'full_time',
  status text NOT NULL DEFAULT 'active',
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read employees" ON public.hr_employees FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage employees" ON public.hr_employees FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Leave Types
CREATE TABLE public.hr_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_days_per_year numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read leave types" ON public.hr_leave_types FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage leave types" ON public.hr_leave_types FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Leave Balances
CREATE TABLE public.hr_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,
  remaining_days numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);
ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read leave balances" ON public.hr_leave_balances FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage leave balances" ON public.hr_leave_balances FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Leave Requests
CREATE TABLE public.hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.hr_leave_types(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL DEFAULT 1,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read leave requests" ON public.hr_leave_requests FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage leave requests" ON public.hr_leave_requests FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Shifts
CREATE TABLE public.hr_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read shifts" ON public.hr_shifts FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage shifts" ON public.hr_shifts FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Attendance
CREATE TABLE public.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  hours_worked numeric,
  overtime_hours numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'present',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read attendance" ON public.hr_attendance FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage attendance" ON public.hr_attendance FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- HR Payroll
CREATE TABLE public.hr_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  forecast_base_salary numeric NOT NULL DEFAULT 0,
  forecast_allowances numeric NOT NULL DEFAULT 0,
  forecast_deductions numeric NOT NULL DEFAULT 0,
  forecast_overtime numeric NOT NULL DEFAULT 0,
  forecast_bonus numeric NOT NULL DEFAULT 0,
  forecast_total numeric NOT NULL DEFAULT 0,
  actual_base_salary numeric,
  actual_allowances numeric,
  actual_deductions numeric,
  actual_overtime numeric,
  actual_bonus numeric,
  actual_total numeric,
  payment_status text NOT NULL DEFAULT 'pending',
  payment_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year, month)
);
ALTER TABLE public.hr_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payroll" ON public.hr_payroll FOR SELECT USING (true);
CREATE POLICY "Admins/managers can manage payroll" ON public.hr_payroll FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Triggers for updated_at
CREATE TRIGGER update_hr_departments_updated_at BEFORE UPDATE ON public.hr_departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_employees_updated_at BEFORE UPDATE ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_leave_balances_updated_at BEFORE UPDATE ON public.hr_leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_leave_requests_updated_at BEFORE UPDATE ON public.hr_leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_shifts_updated_at BEFORE UPDATE ON public.hr_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_attendance_updated_at BEFORE UPDATE ON public.hr_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_payroll_updated_at BEFORE UPDATE ON public.hr_payroll FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
