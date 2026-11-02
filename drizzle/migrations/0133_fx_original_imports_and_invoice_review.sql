ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS original_amount numeric, ADD COLUMN IF NOT EXISTS base_money_in numeric, ADD COLUMN IF NOT EXISTS base_money_out numeric;
ALTER TABLE public.payment_settlement_batches ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS original_amounts jsonb;
ALTER TABLE public.payment_settlement_lines ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS original_amounts jsonb;
ALTER TABLE public.payment_settlement_transactions ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS original_amounts jsonb;
ALTER TABLE public.deposit_opening_balances ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS original_total numeric, ADD COLUMN IF NOT EXISTS fx_rate numeric;
CREATE OR REPLACE FUNCTION public.fx_bank_import_amounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE b text;c text;r record; BEGIN
SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=NEW.tenant_id;
SELECT currency INTO c FROM bank_accounts WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_account_id;
NEW.currency:=coalesce(nullif(NEW.currency,''),c,b);
IF c IS DISTINCT FROM NEW.currency THEN RAISE EXCEPTION 'Statement currency does not match the selected account';END IF;
IF NEW.currency<>b THEN IF coalesce(NEW.fx_rate,0)<=0 THEN SELECT * INTO r FROM fx_rate(NEW.tenant_id,NEW.txn_date,NEW.currency);NEW.fx_rate:=r.rate;NEW.fx_rate_source:=r.source;END IF; IF coalesce(NEW.fx_rate,0)<=0 THEN RAISE EXCEPTION 'No reference rate for statement transaction date';END IF;NEW.original_amount:=NEW.money_in-NEW.money_out;NEW.base_money_in:=round(NEW.money_in*NEW.fx_rate,2);NEW.base_money_out:=round(NEW.money_out*NEW.fx_rate,2);
ELSE NEW.base_money_in:=NEW.money_in;NEW.base_money_out:=NEW.money_out;END IF;RETURN NEW;END $$;
CREATE TRIGGER fx_bank_import_amounts BEFORE INSERT ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.fx_bank_import_amounts();
COMMENT ON COLUMN public.bank_transactions.base_money_in IS 'Base equivalent of native statement money_in, using the transaction-date rate; native amounts are immutable evidence.';
CREATE OR REPLACE FUNCTION public.fx_settlement_import_amounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t uuid;c text;b text;d date;r record;v jsonb;k text; BEGIN
IF TG_TABLE_NAME='payment_settlement_batches' THEN t:=NEW.tenant_id;SELECT currency INTO c FROM payment_settlement_imports WHERE tenant_id=t AND id=NEW.import_id;d:=NEW.transaction_date;
ELSE SELECT tenant_id,currency,transaction_date INTO t,c,d FROM payment_settlement_batches WHERE id=NEW.batch_id; IF TG_TABLE_NAME='payment_settlement_transactions' THEN d:=coalesce(nullif(to_jsonb(NEW)->>'transaction_time','')::timestamp::date,d);END IF;END IF;
SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;NEW.currency:=coalesce(nullif(NEW.currency,''),c,b);
IF NEW.currency=b THEN RETURN NEW;END IF;
IF coalesce(NEW.fx_rate,0)<=0 THEN SELECT * INTO r FROM fx_rate(t,d,NEW.currency);NEW.fx_rate:=r.rate;END IF;
IF coalesce(NEW.fx_rate,0)<=0 THEN RAISE EXCEPTION 'No reference rate for settlement transaction date';END IF;
v:=to_jsonb(NEW);NEW.original_amounts:='{}';
FOREACH k IN ARRAY ARRAY['gross_amount','fee_amount','net_amount','net_settlement','points_offset','bank_transfer_fee','adjustments','frozen_amount','expected_fee','fee_variance'] LOOP IF v ? k THEN NEW.original_amounts:=NEW.original_amounts||jsonb_build_object(k,v->k);v:=jsonb_set(v,ARRAY[k],to_jsonb(round(coalesce((v->>k)::numeric,0)*NEW.fx_rate,2)));END IF;END LOOP;
v:=jsonb_set(v,'{original_amounts}',NEW.original_amounts);NEW:=jsonb_populate_record(NEW,v);RETURN NEW;END $$;
CREATE TRIGGER fx_settlement_batches BEFORE INSERT ON public.payment_settlement_batches FOR EACH ROW EXECUTE FUNCTION public.fx_settlement_import_amounts();
CREATE TRIGGER fx_settlement_lines BEFORE INSERT ON public.payment_settlement_lines FOR EACH ROW EXECUTE FUNCTION public.fx_settlement_import_amounts();
CREATE TRIGGER fx_settlement_transactions BEFORE INSERT ON public.payment_settlement_transactions FOR EACH ROW EXECUTE FUNCTION public.fx_settlement_import_amounts();
DO $$ DECLARE def text;BEGIN SELECT pg_get_functiondef('public.create_scanner_invoice_with_attachments(uuid,jsonb,jsonb,jsonb)'::regprocedure) INTO def;
IF position('held_amount, source_origin' IN def)=0 OR position('''scanner''' IN def)=0 THEN RAISE EXCEPTION 'Scanner currency insertion anchor changed';END IF;
def:=replace(def,'held_amount, source_origin','held_amount, source_origin, currency, fx_rate, original_total, fx_rate_source');
def:=replace(def,'''scanner''
  )','''scanner'', nullif(p_invoice->>''currency'',''''), nullif(p_invoice->>''fx_rate'','''')::numeric, nullif(p_invoice->>''original_total'','''')::numeric, p_invoice->>''fx_rate_source''
  )');EXECUTE def;END $$;
CREATE OR REPLACE FUNCTION public.finance_invoice_fx_set(t uuid,ident uuid,c text,r numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i invoices;b text;rate_row record;factor numeric;orig numeric;BEGIN
IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required';END IF;SELECT * INTO i FROM invoices WHERE tenant_id=t AND id=ident FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable';END IF;
IF EXISTS(SELECT 1 FROM journal_entries WHERE tenant_id=t AND source_type='invoice' AND source_id=i.id::text AND status='posted') OR coalesce(i.amount_paid,0)>0 THEN RAISE EXCEPTION 'Posted or paid invoices retain original currency; prepare a correction instead';END IF;PERFORM finance_assert_open(t,i.invoice_date);
SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;c:=upper(c);IF c !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Enter an ISO currency';END IF;
IF c=b THEN r:=1;ELSE IF coalesce(r,0)<=0 THEN SELECT * INTO rate_row FROM fx_rate(t,i.invoice_date,c);r:=rate_row.rate;END IF;IF coalesce(r,0)<=0 THEN RAISE EXCEPTION 'No rate for invoice date';END IF;END IF;
IF i.original_total IS NOT NULL AND i.currency IS DISTINCT FROM c THEN RAISE EXCEPTION 'Foreign currency already recorded; retain it and change the rate only';END IF;
orig:=coalesce(i.original_total,i.total_amount);factor:=CASE WHEN i.total_amount=0 THEN r ELSE round(orig*r,2)/i.total_amount END;
UPDATE invoices SET currency=c,fx_rate=CASE WHEN c=b THEN NULL ELSE r END,fx_rate_source=CASE WHEN rate_row.rate IS NOT NULL THEN rate_row.source ELSE 'document override' END,original_total=CASE WHEN c=b THEN NULL ELSE orig END,total_amount=round(orig*r,2),subtotal=round(subtotal*factor,2),tax_amount=round(tax_amount*factor,2),discount=round(discount*factor,2),held_amount=round(held_amount*factor,2) WHERE id=ident AND tenant_id=t;
UPDATE invoice_line_items SET unit_price=unit_price*factor,total=round(total*factor,2),tax_amount=round(tax_amount*factor,2),discount=round(discount*factor,2),accepted_price=accepted_price*factor,net_unit_cost=net_unit_cost*factor,normalized_unit_cost=normalized_unit_cost*factor WHERE invoice_id=ident AND tenant_id=t;
END $$;
REVOKE ALL ON FUNCTION public.finance_invoice_fx_set(uuid,uuid,text,numeric) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.finance_invoice_fx_set(uuid,uuid,text,numeric) TO authenticated;