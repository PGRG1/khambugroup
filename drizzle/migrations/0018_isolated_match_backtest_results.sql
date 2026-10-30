CREATE TABLE public.match_backtest_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 run_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 line_id uuid NOT NULL,
 expected_product_id uuid,
 decision text NOT NULL CHECK (decision IN ('sure','probably','cant_tell','new','not_a_product')),
 predicted_product_id uuid,
 alternatives uuid[] NOT NULL DEFAULT '{}',
 reason text NOT NULL,
 correct boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (run_id, line_id)
);
GRANT SELECT ON public.match_backtest_results TO authenticated;
GRANT ALL ON public.match_backtest_results TO service_role;
ALTER TABLE public.match_backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_backtest_admin_read ON public.match_backtest_results FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE INDEX match_backtest_tenant_run ON public.match_backtest_results (tenant_id, run_id);
COMMENT ON TABLE public.match_backtest_results IS 'Isolated invoice matching evaluation only; never updates invoice or product records.';