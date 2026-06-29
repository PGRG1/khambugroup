
-- expense_categories: add parent_category_id and is_active (default_account_id and tenant_id already exist)
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS parent_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- suppliers: vendor_type + payment_terms_id (FK added after expense_payment_terms is created)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS vendor_type text NOT NULL DEFAULT 'procurement',
  ADD COLUMN IF NOT EXISTS payment_terms_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_vendor_type_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_vendor_type_check
      CHECK (vendor_type IN ('procurement', 'expense', 'both'));
  END IF;
END $$;

-- expense_payment_terms
CREATE TABLE IF NOT EXISTS public.expense_payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  days integer NOT NULL DEFAULT 30,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_payment_terms TO authenticated;
GRANT ALL ON public.expense_payment_terms TO service_role;

ALTER TABLE public.expense_payment_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_payment_terms select" ON public.expense_payment_terms;
CREATE POLICY "expense_payment_terms select"
  ON public.expense_payment_terms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "expense_payment_terms insert" ON public.expense_payment_terms;
CREATE POLICY "expense_payment_terms insert"
  ON public.expense_payment_terms FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "expense_payment_terms update" ON public.expense_payment_terms;
CREATE POLICY "expense_payment_terms update"
  ON public.expense_payment_terms FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "expense_payment_terms delete" ON public.expense_payment_terms;
CREATE POLICY "expense_payment_terms delete"
  ON public.expense_payment_terms FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- Link suppliers.payment_terms_id → expense_payment_terms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_payment_terms_fk'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_payment_terms_fk
      FOREIGN KEY (payment_terms_id)
      REFERENCES public.expense_payment_terms(id)
      ON DELETE SET NULL;
  END IF;
END $$;
