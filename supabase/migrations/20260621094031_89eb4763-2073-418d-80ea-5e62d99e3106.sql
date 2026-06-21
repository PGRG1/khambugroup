ALTER TABLE public.expense_recurring_rules
  ADD COLUMN IF NOT EXISTS recognition_day text,
  ADD COLUMN IF NOT EXISTS combined_venues boolean NOT NULL DEFAULT false;