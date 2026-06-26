
-- supplier_opening_balances
CREATE TABLE public.supplier_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  as_of_date date NOT NULL DEFAULT CURRENT_DATE,
  venue text,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, as_of_date)
);
CREATE INDEX supplier_opening_balances_tenant_idx ON public.supplier_opening_balances(tenant_id);
CREATE INDEX supplier_opening_balances_supplier_idx ON public.supplier_opening_balances(supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_opening_balances TO authenticated;
GRANT ALL ON public.supplier_opening_balances TO service_role;

ALTER TABLE public.supplier_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sob_select_tenant" ON public.supplier_opening_balances
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));

CREATE POLICY "sob_insert_admin_manager" ON public.supplier_opening_balances
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()))
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE POLICY "sob_update_admin_manager" ON public.supplier_opening_balances
  FOR UPDATE TO authenticated
  USING (
    (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()))
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE POLICY "sob_delete_admin_manager" ON public.supplier_opening_balances
  FOR DELETE TO authenticated
  USING (
    (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()))
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE TRIGGER update_supplier_opening_balances_updated_at
  BEFORE UPDATE ON public.supplier_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- deposit_opening_balances
CREATE TABLE public.deposit_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  product_master_id uuid REFERENCES public.product_master(id) ON DELETE SET NULL,
  sku text NOT NULL DEFAULT '',
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_value numeric NOT NULL CHECK (unit_value > 0),
  total_value numeric GENERATED ALWAYS AS (quantity * unit_value) STORED,
  venue text,
  as_of_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deposit_opening_balances_tenant_idx ON public.deposit_opening_balances(tenant_id);
CREATE INDEX deposit_opening_balances_supplier_idx ON public.deposit_opening_balances(supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_opening_balances TO authenticated;
GRANT ALL ON public.deposit_opening_balances TO service_role;

ALTER TABLE public.deposit_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dob_select_tenant" ON public.deposit_opening_balances
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));

CREATE POLICY "dob_insert_admin_manager" ON public.deposit_opening_balances
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()))
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE POLICY "dob_update_admin_manager" ON public.deposit_opening_balances
  FOR UPDATE TO authenticated
  USING (
    (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()))
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE POLICY "dob_delete_admin_manager" ON public.deposit_opening_balances
  FOR DELETE TO authenticated
  USING (
    (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()))
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE TRIGGER update_deposit_opening_balances_updated_at
  BEFORE UPDATE ON public.deposit_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- credit_notes flag
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS is_opening_balance boolean NOT NULL DEFAULT false;
