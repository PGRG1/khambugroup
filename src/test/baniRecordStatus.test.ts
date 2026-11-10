import { describe, expect, it } from 'vitest';
import { recordStatusQuery } from '../../supabase/functions/chat-assistant/recordStatus';

function capture() {
  const calls: unknown[][] = [];
  const q: any = {};
  for (const method of ['eq', 'is', 'lt', 'or', 'in', 'not']) q[method] = (...args: unknown[]) => { calls.push([method, ...args]); return q; };
  return { q, calls };
}
describe('Bani overdue detail uses due dates, not an invented approval status', () => {
  it('selects overdue approved/posted bills, withholding paid or reversed bills', () => {
    const { q, calls } = capture();
    recordStatusQuery(q, 'bills', 'overdue', '2026-11-10');
    expect(calls).toEqual([
      ['is', 'reversed_at', null], ['lt', 'due_date', '2026-11-10'],
      ['or', 'payment_status.neq.paid,payment_status.is.null'], ['in', 'approval_status', ['approved', 'posted']],
    ]);
  });
  it('selects overdue invoices without treating overdue as review_status', () => {
    const { q, calls } = capture();
    recordStatusQuery(q, 'invoices', 'overdue', '2026-11-10');
    expect(calls).toEqual([
      ['is', 'voided_at', null], ['lt', 'due_date', '2026-11-10'],
      ['or', 'payment_status.neq.paid,payment_status.is.null'], ['not', 'review_status', 'in', '(Draft,Voided)'],
    ]);
  });
  it('retains ordinary invoice inspection status', () => {
    const { q, calls } = capture();
    recordStatusQuery(q, 'invoices', 'Disputed', '2026-11-10');
    expect(calls).toEqual([['is', 'voided_at', null], ['eq', 'review_status', 'Disputed']]);
  });
});