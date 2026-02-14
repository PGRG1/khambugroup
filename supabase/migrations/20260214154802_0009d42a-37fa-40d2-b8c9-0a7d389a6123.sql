
-- Create pl_manual_lines table for manual P&L inputs
CREATE TABLE public.pl_manual_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER, -- null = annual total
  line_item_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pl_manual_lines ENABLE ROW LEVEL SECURITY;

-- Admins and managers can do everything
CREATE POLICY "Authenticated users can read pl_manual_lines"
ON public.pl_manual_lines FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert pl_manual_lines"
ON public.pl_manual_lines FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins can update pl_manual_lines"
ON public.pl_manual_lines FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins can delete pl_manual_lines"
ON public.pl_manual_lines FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pl_manual_lines_updated_at
BEFORE UPDATE ON public.pl_manual_lines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
