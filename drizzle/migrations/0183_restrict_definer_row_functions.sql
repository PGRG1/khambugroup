REVOKE EXECUTE ON FUNCTION public.user_venue_ids(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_schedule_source(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_depreciation_period(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_bank_opening_value(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.smart_alert_reconciliations(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_reconciliation_rows(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expense_statement_check(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expense_meter_split(uuid, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_venue_ids(uuid, uuid), public.finance_schedule_source(uuid, text, uuid), public.preview_depreciation_period(uuid, integer, integer), public.finance_bank_opening_value(uuid, uuid), public.smart_alert_reconciliations(uuid, date), public.finance_reconciliation_rows(uuid, date), public.expense_statement_check(uuid, date), public.expense_meter_split(uuid, date, numeric) TO service_role;