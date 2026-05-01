DO $$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef('public.rebuild_journal_from_operations()'::regprocedure) INTO fn;

  fn := replace(
    fn,
    '''payroll_net_payment'', pr.id::text',
    '''payroll_payment'', pr.id::text'
  );

  fn := replace(
    fn,
    '''payroll_mpf_payment'', pr.id::text',
    '''mpf_payment'', pr.id::text'
  );

  EXECUTE fn;
END $$;