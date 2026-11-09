import { describe, expect, it } from 'vitest';
import { missingDayContext } from '../../supabase/functions/chat-assistant/missingSalesConversation';

describe('multi-day sales-gap evidence', () => {
  it('keeps every date in a seven-day gap individually unresolved', () => {
    const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const result = missingDayContext(dates, new Set());
    expect(result.map(d => d.date)).toEqual(dates);
    expect(result.map(d => d.weekday)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(result.map(d => d.status)).toEqual(Array(7).fill('unresolved'));
  });
  it('does not classify absent historical Mondays as closed', () => {
    const [monday] = missingDayContext(['2026-11-02'], new Set(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']));
    expect(monday.prior_same_weekday_sales).toBe(0);
    expect(monday.status).toBe('unresolved');
  });
  it('counts only earlier same-weekday sales within eight weeks', () => {
    const [tuesday] = missingDayContext(['2026-11-03'], new Set(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-10-26', '2026-09-01', '2026-11-10']));
    expect(tuesday.prior_same_weekday_sales).toBe(4);
    expect(tuesday.prior_same_weekdays_checked).toBe(8);
    expect(tuesday.status).toBe('unresolved');
  });
});