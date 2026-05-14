ALTER TABLE public.hr_payroll
  ADD COLUMN IF NOT EXISTS earned_salary_override numeric,
  ADD COLUMN IF NOT EXISTS adjustments_override numeric,
  ADD COLUMN IF NOT EXISTS mpf_employee_override numeric,
  ADD COLUMN IF NOT EXISTS mpf_employer_override numeric;