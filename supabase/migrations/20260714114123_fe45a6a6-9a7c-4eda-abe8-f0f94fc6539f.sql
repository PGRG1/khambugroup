DO $$
DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT tenant_id, rule_type, match_key FROM public.account_mapping_rules
    GROUP BY 1,2,3 HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique constraint: % duplicate (tenant_id, rule_type, match_key) combinations exist', dup_count;
  END IF;
END $$;

ALTER TABLE public.account_mapping_rules
  DROP CONSTRAINT IF EXISTS account_mapping_rules_rule_type_match_key_key;

ALTER TABLE public.account_mapping_rules
  ADD CONSTRAINT account_mapping_rules_tenant_rule_match_key
  UNIQUE (tenant_id, rule_type, match_key);