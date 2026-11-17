-- Card payout fixes.
-- 1) One bank deposit matched to several payouts: link each payout to the bank line so it gets booked.
-- 2) The payout booking uses each payout's own amount when several payouts share one bank line
--    (otherwise each would debit the whole deposit).
-- 3) Backfill payouts already matched this way, in open months only (closed months stay untouched).
-- 4) The same payout can't be saved twice.

-- 1) finance_confirm_bank_matches: link settlement batches to the bank line.
DO $fix1$
DECLARE s text; anchor text; ins text;
BEGIN
  s := pg_get_functiondef('public.finance_confirm_bank_matches(uuid,uuid,jsonb,text)'::regprocedure);
  anchor := $a$INSERT INTO audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(t,uid,'bank_multi_match_confirmed'$a$;
  ins := $b$UPDATE payment_settlement_batches SET bank_transaction_id=b.id,bank_account_id=coalesce(bank_account_id,b.bank_account_id),status='matched' WHERE tenant_id=t AND bank_transaction_id IS NULL AND id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(items) x WHERE x->>'type'='settlement_batch');
$b$;
  IF (length(s) - length(replace(s, anchor, ''))) <> length(anchor) THEN
    RAISE EXCEPTION 'finance_confirm_bank_matches anchor not found exactly once';
  END IF;
  EXECUTE replace(s, anchor, ins || anchor);
END $fix1$;

-- 2) Ledger rebuild: per-payout bank amount when payouts share one bank line.
DO $fix2$
DECLARE r record; d text; anchor text; repl text;
BEGIN
  anchor := 'v_bank_amt := ROUND(GREATEST(COALESCE(sb.bank_money_in,0), 0)::numeric, 2);';
  repl := 'v_bank_amt := ROUND(GREATEST(CASE WHEN (SELECT count(*) FROM public.payment_settlement_batches x WHERE x.tenant_id = p_tenant_id AND x.bank_transaction_id = sb.bank_transaction_id) > 1 THEN COALESCE(sb.net_settlement,0) ELSE COALESCE(sb.bank_money_in,0) END, 0)::numeric, 2);';
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = '_rebuild_journal_from_operations_impl' LOOP
    d := pg_get_functiondef(r.oid);
    IF (length(d) - length(replace(d, anchor, ''))) <> length(anchor) THEN
      RAISE EXCEPTION 'settlement bank amount anchor not found exactly once';
    END IF;
    EXECUTE replace(d, anchor, repl);
  END LOOP;
END $fix2$;

-- 3) Backfill: payouts already matched to a shared bank line, open months only.
UPDATE public.payment_settlement_batches sb
SET bank_transaction_id = m.txn_id,
    bank_account_id = COALESCE(sb.bank_account_id, bt.bank_account_id),
    status = 'matched'
FROM public.bank_transaction_matches m
JOIN public.bank_transactions bt ON bt.id = m.txn_id AND bt.tenant_id = m.tenant_id
WHERE m.matched_type = 'settlement_batch'
  AND m.matched_id = sb.id::text
  AND m.tenant_id = sb.tenant_id
  AND sb.bank_transaction_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.finance_closed_periods cp
    WHERE cp.tenant_id = sb.tenant_id
      AND cp.month_start = date_trunc('month', sb.settlement_date)::date
      AND cp.reopened_at IS NULL
  );

-- 4) The same payout can't be saved twice (runs after the currency conversion trigger).
CREATE OR REPLACE FUNCTION public.payment_settlement_batch_no_duplicate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payment_settlement_batches x
    WHERE x.tenant_id = NEW.tenant_id
      AND x.merchant_id = NEW.merchant_id
      AND x.settlement_date = NEW.settlement_date
      AND x.transaction_date = NEW.transaction_date
      AND x.gross_amount = NEW.gross_amount
      AND x.net_settlement = NEW.net_settlement
  ) THEN
    RAISE EXCEPTION 'This payout is already saved';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_settlement_batch_no_duplicate ON public.payment_settlement_batches;
CREATE TRIGGER zz_settlement_batch_no_duplicate
BEFORE INSERT ON public.payment_settlement_batches
FOR EACH ROW EXECUTE FUNCTION public.payment_settlement_batch_no_duplicate();
