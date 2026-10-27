CREATE TABLE public.bani_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mark_closed_days', 'open_sales_scanner', 'open_invoice_scanner')),
  title text NOT NULL CHECK (char_length(title) <= 200),
  detail text CHECK (detail IS NULL OR char_length(detail) <= 500),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  resolved_at timestamptz
);
GRANT ALL ON public.bani_pending_actions TO service_role;
ALTER TABLE public.bani_pending_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX bani_pending_actions_user ON public.bani_pending_actions (tenant_id, user_id, status);