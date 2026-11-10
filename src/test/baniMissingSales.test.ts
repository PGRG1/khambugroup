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

import { dayPickerLines, defaultGapFrom, pinDayPicker, continueMissingSalesReply, isGapClarification, overviewMissingSales } from '../../supabase/functions/chat-assistant/missingSalesConversation';

describe('missing-sales clarification stays actionable', () => {
  it('overview uses the same full-month lookup without a yesterday-only filter', async () => {
    const calls: { venue?: string }[] = [];
    const result = { through: '2026-11-09', venues: [{ venue: 'Maison Francis', missing_dates: ['2026-11-02', '2026-11-03', '2026-11-09'] }] };
    const lookup = async (args: { venue?: string }) => { calls.push(args); return result; };
    expect(await overviewMissingSales(lookup, 'Maison Francis')).toBe(result);
    expect(await overviewMissingSales(lookup, null)).toBe(result);
    expect(calls).toEqual([{ venue: 'Maison Francis' }, {}]);
  });
  it('answers the question and retains every unresolved date for classification', () => {
    const dates = ['2026-11-02', '2026-11-03', '2026-11-08'];
    const answer = continueMissingSalesReply('No, those dates have no saved sales.', dates, true);
    expect(answer.startsWith('No, those dates have no saved sales.')).toBe(true);
    expect(answer).toContain('2026-11-02 | Mon 2 Nov');
    expect(answer).toContain('2026-11-03 | Tue 3 Nov');
    expect(answer).toContain('2026-11-08 | Sun 8 Nov');
  });
  it('does not add classification for resolved gaps, failed reads or unrelated replies', () => {
    for (const dates of [[], null]) expect(continueMissingSalesReply('No.', dates, true)).toBe('No.');
    expect(continueMissingSalesReply('No.', ['2026-11-03'], false)).toBe('No.');
  });
  it('recognizes a saved-sales clarification only inside an existing missing-day conversation', () => {
    const history = 'No sales recorded for 2–8 Nov. Historical pattern suggests trading.';
    expect(isGapClarification('so nov 3 to 8 has sales recorded?', history)).toBe(true);
    expect(isGapClarification('so nov 3 to 8 has sales recorded?', 'Let us review purchases.')).toBe(false);
    expect(isGapClarification('Show my menu margins', history)).toBe(false);
  });
});

describe('day picker always shows the days worked out in code', () => {
  const gap = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  it('defaults the gap to this month so every chat asks about the same days', () => {
    expect(defaultGapFrom('2026-11-08')).toBe('2026-11-01');
    expect(defaultGapFrom('2026-12-01')).toBe('2026-12-01');
  });
  it('writes one line per day with its weekday', () => {
    expect(dayPickerLines(['2026-11-03', '2026-11-02', '2026-11-02'])).toEqual(['2026-11-02 | Mon 2 Nov', '2026-11-03 | Tue 3 Nov']);
  });
  it('replaces whatever days the model listed with the exact gap', () => {
    const reply = 'Mark each day:\n\n```daypicker\n2026-11-03 | Tue 3 Nov\n2026-11-06 | Fri 6 Nov\n```\n\nThen send.';
    const out = pinDayPicker(reply, gap);
    expect(out).toContain('2026-11-02 | Mon 2 Nov\n2026-11-03 | Tue 3 Nov');
    expect(out).toContain('2026-11-08 | Sun 8 Nov\n```');
    expect(out.match(/\| /g)?.length).toBe(7);
    expect(out.startsWith('Mark each day:')).toBe(true);
    expect(out.endsWith('Then send.')).toBe(true);
  });
  it('gives the same picker no matter which days the model picked', () => {
    const a = pinDayPicker('```daypicker\n2026-11-02 | Mon 2 Nov\n```', gap);
    const b = pinDayPicker('```daypicker\n2026-11-04 | Wed 4 Nov\n2026-11-05 | Thu 5 Nov\n```', gap);
    expect(a).toBe(b);
  });
  it('drops the picker when nothing is left, and leaves the reply alone if the lookup failed', () => {
    expect(pinDayPicker('Done.\n\n```daypicker\n2026-11-02 | Mon 2 Nov\n```', [])).toBe('Done.');
    const reply = '```daypicker\n2026-11-02 | Mon 2 Nov\n```';
    expect(pinDayPicker(reply, null)).toBe(reply);
  });
});