-- Disputed supplier invoices post to the books at the full amount billed, the same as approved ones.
-- Why: stock already rises when the delivery note is created, and a supplier credit note is booked for its
-- full amount (it reduces what is owed and the cost). Posting only the accepted amount would make the
-- credit note take the difference off twice. The held amount stays unpaid in payables until the credit
-- note or a resolution clears it. Drafts ('Draft' / under review) still never post.
-- Only two filters in _rebuild_journal_from_operations_impl change; everything else is kept as it is.
DO $mig$
DECLARE
  d text;
  a text := $q$i.review_status='Approved' AND$q$;
  b text := $q$AND i.status IN ('paid','unpaid')$q$;
BEGIN
  d := pg_get_functiondef('public._rebuild_journal_from_operations_impl'::regproc);
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 OR (length(d) - length(replace(d, b, ''))) / length(b) <> 1 THEN
    RAISE EXCEPTION 'Invoice posting filters not found exactly once; nothing changed';
  END IF;
  d := replace(d, a, $q$i.review_status IN ('Approved','Disputed') AND$q$);
  d := replace(d, b, $q$AND i.status IN ('paid','unpaid','disputed')$q$);
  EXECUTE d;
END
$mig$;