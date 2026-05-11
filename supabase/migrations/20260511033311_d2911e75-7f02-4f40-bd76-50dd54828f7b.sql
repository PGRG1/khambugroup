-- Add stable dedup key for AI learned rules
ALTER TABLE public.ai_learned_rules
  ADD COLUMN IF NOT EXISTS rule_key text;

-- Helper: deterministic key from normalized pattern + action
CREATE OR REPLACE FUNCTION public.compute_ai_rule_key(_pattern jsonb, _action jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(
    digest(
      coalesce(_pattern::text,'{}') || '|' || coalesce(_action::text,'{}'),
      'sha256'
    ),
    'hex'
  )
$$;

-- Backfill existing rows
UPDATE public.ai_learned_rules
SET rule_key = public.compute_ai_rule_key(input_pattern, output_action)
WHERE rule_key IS NULL;

-- Auto-maintain rule_key on insert/update
CREATE OR REPLACE FUNCTION public.set_ai_rule_key()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.rule_key := public.compute_ai_rule_key(NEW.input_pattern, NEW.output_action);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_rules_set_key ON public.ai_learned_rules;
CREATE TRIGGER trg_ai_rules_set_key
  BEFORE INSERT OR UPDATE OF input_pattern, output_action ON public.ai_learned_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_rule_key();

-- Make NOT NULL & uniquely indexed per tenant/domain/workflow
ALTER TABLE public.ai_learned_rules
  ALTER COLUMN rule_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_rules_dedup
  ON public.ai_learned_rules(tenant_id, domain, workflow, rule_key);

CREATE INDEX IF NOT EXISTS idx_ai_rules_active_lookup
  ON public.ai_learned_rules(tenant_id, domain, workflow, status)
  WHERE status = 'active';