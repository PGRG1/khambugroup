
REVOKE EXECUTE ON FUNCTION public.record_payment_with_allocations(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_with_allocations(jsonb, jsonb) TO authenticated;
