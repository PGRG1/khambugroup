
CREATE TABLE public.hr_leave_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  accrued NUMERIC(6,2) NOT NULL DEFAULT 0,
  taken NUMERIC(6,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_leave_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage leave ledger"
  ON public.hr_leave_ledger
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_hr_leave_ledger_employee ON public.hr_leave_ledger(employee_id, year);
CREATE INDEX idx_hr_leave_ledger_type ON public.hr_leave_ledger(leave_type_id, year);
