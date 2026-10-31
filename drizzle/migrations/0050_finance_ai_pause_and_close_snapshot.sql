CREATE TABLE public.finance_ai_pause (tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id), reason text NOT NULL, paused_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.finance_ai_pause TO authenticated;
GRANT ALL ON public.finance_ai_pause TO service_role;
ALTER TABLE public.finance_ai_pause ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_ai_pause_read ON public.finance_ai_pause FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(),tenant_id));
ALTER FUNCTION public.finance_month_checks(uuid,date) VOLATILE;