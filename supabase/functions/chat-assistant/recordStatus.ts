/** Read-only record selection. Overdue is a due/payment condition, not an approval status. */
export function recordStatusQuery(q: any, resource: 'invoices' | 'bills' | 'receipts', status: string | undefined, today: string) {
  if (resource === 'receipts') return q.eq('status', status ?? 'needs_review');
  q = resource === 'invoices' ? q.is('voided_at', null) : q.is('reversed_at', null);
  if (status === 'overdue') {
    q = q.lt('due_date', today).or('payment_status.neq.paid,payment_status.is.null');
    return resource === 'bills' ? q.in('approval_status', ['approved', 'posted']) : q.not('review_status', 'in', '(Draft,Voided)');
  }
  if (resource === 'invoices') return status ? q.eq('review_status', status) : q;
  if (status === 'waiting') return q.in('approval_status', ['draft', 'pending_review', 'approved']);
  return status ? q.eq('approval_status', status) : q;
}