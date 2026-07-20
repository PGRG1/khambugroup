SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e6654bb6-41bb-4d70-b93e-ae1253b6845f', true);
SELECT public.post_payroll_accrual(2026, 7) AS result;
RESET ROLE;
DELETE FROM public.ledger_audit_log
 WHERE event_type = 'payroll_accrual_posted'
   AND notes = 'Posted 0 accrual entries for 2026-07';