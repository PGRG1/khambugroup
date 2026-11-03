-- Fix 1: recurring bills inherit the rule's tenant
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.generate_recurring_expense_bills()'::regprocedure);
  n := replace(d, 'source_type, recurring_rule_id, combined_venues, document_requirement
        ) VALUES (', 'source_type, recurring_rule_id, combined_venues, document_requirement, tenant_id
        ) VALUES (');
  n := replace(n, '''recurring_rule'', r.id, r.combined_venues, ''not_required''
        )', '''recurring_rule'', r.id, r.combined_venues, ''not_required'', r.tenant_id
        )');
  n := replace(n, 'amount, tax_treatment, tax_amount, notes
          ) VALUES (', 'amount, tax_treatment, tax_amount, notes, tenant_id
          ) VALUES (');
  n := replace(n, 'r.department, r.expected_amount, ''none'', 0, NULL
          );', 'r.department, r.expected_amount, ''none'', 0, NULL, r.tenant_id
          );');
  n := replace(n, 'expense_bill_audit (bill_id, event_type, actor_id, details)
          VALUES (v_bill_id, ''generated'', NULL, jsonb_build_object(''rule_id'', r.id, ''rule_name'', r.name, ''period_start'', v_period_start));',
                  'expense_bill_audit (bill_id, event_type, actor_id, details, tenant_id)
          VALUES (v_bill_id, ''generated'', NULL, jsonb_build_object(''rule_id'', r.id, ''rule_name'', r.name, ''period_start'', v_period_start), r.tenant_id);');
  IF (length(n) - length(d)) <> length(', tenant_id')*3 + length(', r.tenant_id')*3 THEN
    RAISE EXCEPTION 'generate_recurring_expense_bills patch did not match exactly';
  END IF;
  EXECUTE n;
END $$;

-- Fix 2: targets unique per business
ALTER TABLE public.revenue_targets DROP CONSTRAINT revenue_targets_year_month_key;
ALTER TABLE public.revenue_targets ADD CONSTRAINT revenue_targets_tenant_year_month_key UNIQUE (tenant_id, year, month);

-- Fix 3: venue lookup scoped to the record's business
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.sync_sales_records_venue_id()'::regprocedure);
  n := replace(d, 'WHERE name = NEW.venue LIMIT 1;', 'WHERE name = NEW.venue AND tenant_id = NEW.tenant_id LIMIT 1;');
  IF (length(n) - length(d)) <> length(' AND tenant_id = NEW.tenant_id')*2 THEN
    RAISE EXCEPTION 'sync_sales_records_venue_id patch did not match exactly';
  END IF;
  EXECUTE n;
END $$;

-- Fix 4: skip settlement batches whose payout is already booked from the bank line
DO $$
DECLARE r record; d text; n text; anchor text; ins text;
BEGIN
  anchor := 'source_type=''settlement_clearing'' AND source_id = sb.id::text AND (manually_adjusted = true OR status=''posted'')
    ) THEN CONTINUE; END IF;
';
  ins := '    IF EXISTS (
      SELECT 1 FROM public.bank_transactions bt
      JOIN public.journal_entries je ON je.id = bt.journal_entry_id
      WHERE bt.id = sb.bank_transaction_id AND je.status = ''posted'' AND je.source_type = ''bank_transaction''
    ) THEN CONTINUE; END IF;
';
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
           WHERE s.nspname='public' AND p.proname='_rebuild_journal_from_operations_impl' LOOP
    d := pg_get_functiondef(r.oid);
    IF (length(d) - length(replace(d, anchor, ''))) <> length(anchor) THEN
      RAISE EXCEPTION 'settlement loop anchor not found exactly once';
    END IF;
    n := replace(d, anchor, anchor || ins);
    EXECUTE n;
  END LOOP;
END $$;