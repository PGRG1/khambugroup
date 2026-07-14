
-- 1. Add reversed_by / reversed_at columns
ALTER TABLE public.expense_bills
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

-- 2. reverse_expense_bill RPC
CREATE OR REPLACE FUNCTION public.reverse_expense_bill(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bill public.expense_bills%ROWTYPE;
  v_entry public.journal_entries%ROWTYPE;
  v_new_id uuid;
  v_is_member boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_bill FROM public.expense_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;

  -- Tenant scoping: caller must be a member of the bill's tenant
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = v_uid AND tenant_id = v_bill.tenant_id
  ) INTO v_is_member;
  IF NOT v_is_member AND NOT public.has_role(v_uid, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  IF v_bill.approval_status = 'reversed' THEN
    RAISE EXCEPTION 'Bill has already been reversed';
  END IF;
  IF v_bill.approval_status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted bills can be reversed (current status: %)', v_bill.approval_status;
  END IF;
  IF v_bill.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Bill has no journal entry to reverse';
  END IF;

  SELECT * INTO v_entry FROM public.journal_entries WHERE id = v_bill.journal_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original journal entry not found'; END IF;

  -- Create mirror journal entry (dated today)
  INSERT INTO public.journal_entries (
    entry_date, memo, source_type, source_id, venue, venue_id,
    status, manually_adjusted, tenant_id
  ) VALUES (
    current_date,
    'Reversal of bill: ' || COALESCE(v_bill.vendor_name, '') || ' ' || COALESCE(v_bill.bill_number, ''),
    'adjustment',
    'reversal_of:' || v_entry.id::text,
    v_entry.venue, v_entry.venue_id,
    'posted', true, v_bill.tenant_id
  )
  RETURNING id INTO v_new_id;

  -- Mirror lines: swap debit/credit
  INSERT INTO public.journal_lines (
    entry_id, account_id, debit, credit, venue, venue_id, line_no, memo,
    payment_method, source_amount, mapping_rule_type, mapping_match_key, mapping_status,
    category_l1, tenant_id
  )
  SELECT v_new_id, account_id, credit, debit, venue, venue_id, line_no,
         'Reversal: ' || COALESCE(memo, ''),
         payment_method,
         CASE WHEN source_amount IS NOT NULL THEN -source_amount END,
         mapping_rule_type, mapping_match_key, mapping_status,
         category_l1, v_bill.tenant_id
    FROM public.journal_lines WHERE entry_id = v_entry.id;

  -- Void the original entry
  UPDATE public.journal_entries SET status = 'void', updated_at = now()
    WHERE id = v_entry.id;

  -- Mark bill reversed
  UPDATE public.expense_bills
    SET approval_status = 'reversed',
        reversed_by = v_uid,
        reversed_at = now(),
        updated_at = now()
    WHERE id = p_bill_id;

  -- Audit
  INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, details, tenant_id)
  VALUES (
    p_bill_id, 'reversed', v_uid,
    jsonb_build_object(
      'original_journal_entry_id', v_entry.id,
      'reversal_journal_entry_id', v_new_id
    ),
    v_bill.tenant_id
  );

  RETURN jsonb_build_object('reversal_journal_entry_id', v_new_id, 'original_journal_entry_id', v_entry.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_expense_bill(uuid) TO authenticated;

-- 3. Server-side lock: prevent editing financial fields on posted/reversed bills.
CREATE OR REPLACE FUNCTION public.guard_expense_bill_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard rows that were already posted or reversed BEFORE this update.
  IF OLD.approval_status NOT IN ('posted', 'reversed') THEN
    RETURN NEW;
  END IF;

  -- Allow the reversal RPC (and payment posting) to transition status/paid_amount/reversal fields.
  -- Block edits to the immutable financial header + identity fields.
  IF NEW.bill_date        IS DISTINCT FROM OLD.bill_date
  OR NEW.vendor_name      IS DISTINCT FROM OLD.vendor_name
  OR NEW.supplier_id      IS DISTINCT FROM OLD.supplier_id
  OR NEW.bill_number      IS DISTINCT FROM OLD.bill_number
  OR NEW.subtotal         IS DISTINCT FROM OLD.subtotal
  OR NEW.tax_amount       IS DISTINCT FROM OLD.tax_amount
  OR NEW.total_amount     IS DISTINCT FROM OLD.total_amount
  OR NEW.currency         IS DISTINCT FROM OLD.currency
  OR NEW.venue_id         IS DISTINCT FROM OLD.venue_id
  OR NEW.venue            IS DISTINCT FROM OLD.venue
  OR NEW.department       IS DISTINCT FROM OLD.department THEN
    RAISE EXCEPTION 'Cannot edit a % bill. Reverse it first, then create a corrected bill.', OLD.approval_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_bills_locked ON public.expense_bills;
CREATE TRIGGER trg_expense_bills_locked
  BEFORE UPDATE ON public.expense_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_bill_locked();

-- Also block allocation mutations on posted/reversed bills
CREATE OR REPLACE FUNCTION public.guard_expense_bill_alloc_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_bill_id uuid;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  SELECT approval_status INTO v_status FROM public.expense_bills WHERE id = v_bill_id;
  IF v_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Cannot modify allocations of a % bill. Reverse it first, then create a corrected bill.', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_bill_alloc_locked ON public.expense_bill_allocations;
CREATE TRIGGER trg_expense_bill_alloc_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.expense_bill_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_bill_alloc_locked();
