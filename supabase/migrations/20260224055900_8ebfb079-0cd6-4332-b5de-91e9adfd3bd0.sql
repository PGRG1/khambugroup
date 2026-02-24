
-- =============================================
-- 1. RESTRUCTURE hr_payroll FOR NEW REQUIREMENTS
-- =============================================

-- Add new salary component columns
ALTER TABLE public.hr_payroll
  ADD COLUMN IF NOT EXISTS annual_leave_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS statutory_holiday_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_payments numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_payments_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS mpf_employee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mpf_employer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_leave_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS gross_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_salary_payment_date date,
  ADD COLUMN IF NOT EXISTS mpf_payment_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mpf_payment_date date,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'bank_transfer';

-- Rename existing columns to match new structure (keep forecast_ as base_salary)
-- We'll use actual_base_salary as the primary "base_salary" going forward
-- But keep forecast columns for budget comparison

-- =============================================
-- 2. EMPLOYEE HISTORY TABLE (promotions, salary changes, contract changes)
-- =============================================
CREATE TABLE IF NOT EXISTS public.hr_employee_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  change_type text NOT NULL DEFAULT 'other', -- promotion, salary_change, position_change, contract_change, status_change, other
  old_value text,
  new_value text,
  field_changed text, -- job_title, department_id, employment_type, status, base_salary, etc.
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.hr_employee_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can manage employee history"
  ON public.hr_employee_history FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated can read employee history"
  ON public.hr_employee_history FOR SELECT
  USING (true);

-- =============================================
-- 3. HOLIDAYS TABLE (Statutory + Public Holidays)
-- =============================================
CREATE TABLE IF NOT EXISTS public.hr_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  year integer NOT NULL,
  holiday_type text NOT NULL DEFAULT 'statutory', -- statutory, public
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can manage holidays"
  ON public.hr_holidays FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated can read holidays"
  ON public.hr_holidays FOR SELECT
  USING (true);

-- =============================================
-- 4. ENHANCE hr_shifts FOR BETTER SCHEDULING
-- =============================================
ALTER TABLE public.hr_shifts
  ADD COLUMN IF NOT EXISTS shift_type text NOT NULL DEFAULT 'regular', -- regular, al, sh, ph, sick_no_pay, no_pay, off, rest, training
  ADD COLUMN IF NOT EXISTS actual_start_time time,
  ADD COLUMN IF NOT EXISTS actual_end_time time,
  ADD COLUMN IF NOT EXISTS actual_break_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_hours_worked numeric,
  ADD COLUMN IF NOT EXISTS variance_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false;

-- =============================================
-- 5. ENHANCE hr_leave_balances FOR BETTER TRACKING
-- =============================================
ALTER TABLE public.hr_leave_balances
  ADD COLUMN IF NOT EXISTS carried_forward numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustments numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_notes text DEFAULT '';

-- =============================================
-- 6. ADD updated_at TRIGGER FOR NEW TABLES
-- =============================================
CREATE TRIGGER update_hr_holidays_updated_at
  BEFORE UPDATE ON public.hr_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
