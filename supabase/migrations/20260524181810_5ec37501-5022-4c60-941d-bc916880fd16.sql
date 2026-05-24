ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'Under Review',
ADD COLUMN IF NOT EXISTS exception_note text NOT NULL DEFAULT '-';