
CREATE TABLE public.staff_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NULL,
  claimant_name text NOT NULL,
  description text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.petty_cash_classifications(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  claim_date date NOT NULL,
  receipt_url text NULL,
  receipt_path text NULL,
  status text NOT NULL DEFAULT 'owing' CHECK (status IN ('owing','paid')),
  paid_date date NULL,
  paid_from text NULL CHECK (paid_from IN ('bank','petty_cash','payroll')),
  paid_from_bank_account_id uuid NULL REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  paid_from_float_id uuid NULL REFERENCES public.petty_cash_floats(id) ON DELETE SET NULL,
  journal_entry_id uuid NULL REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  payment_journal_entry_id uuid NULL REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_reimbursements TO authenticated;
GRANT ALL ON public.staff_reimbursements TO service_role;

ALTER TABLE public.staff_reimbursements ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_reimbursements_select ON public.staff_reimbursements
  FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY staff_reimbursements_write ON public.staff_reimbursements
  FOR ALL
  USING (is_super_admin(auth.uid()) OR (user_has_tenant(auth.uid(), tenant_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))
  WITH CHECK (is_super_admin(auth.uid()) OR (user_has_tenant(auth.uid(), tenant_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));

CREATE INDEX staff_reimbursements_tenant_status_idx ON public.staff_reimbursements(tenant_id, status);
CREATE INDEX staff_reimbursements_claim_date_idx ON public.staff_reimbursements(tenant_id, claim_date DESC);

CREATE TRIGGER staff_reimbursements_set_updated_at
  BEFORE UPDATE ON public.staff_reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
