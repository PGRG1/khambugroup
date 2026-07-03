
-- Enforce read-only client access to statistical daily table.
-- Only the SECURITY DEFINER RPC (owned by postgres) may write.

DROP POLICY IF EXISTS stat_targets_daily_write_members ON public.revenue_statistical_targets_daily;

REVOKE INSERT, UPDATE, DELETE ON public.revenue_statistical_targets_daily FROM authenticated;
REVOKE ALL ON public.revenue_statistical_targets_daily FROM anon, PUBLIC;
GRANT SELECT ON public.revenue_statistical_targets_daily TO authenticated;
GRANT ALL ON public.revenue_statistical_targets_daily TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_statistical_targets_month(uuid, integer, integer, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_statistical_targets_month(uuid, integer, integer, uuid[], text) TO authenticated, service_role;
