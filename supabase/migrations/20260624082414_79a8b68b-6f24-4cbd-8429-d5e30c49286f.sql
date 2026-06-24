ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS categories     text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_days  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moq            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_number text    NOT NULL DEFAULT '';