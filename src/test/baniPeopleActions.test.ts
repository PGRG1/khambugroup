import { describe, it, expect } from 'vitest';
import { exactPerson, checkedDate, monday, instructedPay, establishedScope, establishedPeriod, PEOPLE_OPERATIONS } from '../../supabase/functions/chat-assistant/peopleRules';
const people = [{id:'a',first_name:'Ken',last_name:'Chan'},{id:'b',first_name:'Ken',last_name:'Wong'}];
describe('Bani People action rules', () => {
 it('never selects between several Ken records', () => expect(() => exactPerson('Ken',people)).toThrow('several'));
 it('asks when no person matches', () => expect(() => exactPerson('Nobody',people)).toThrow('No person'));
 it('resolves the exact full name', () => expect(exactPerson('Ken Chan',people).id).toBe('a'));
 it('requires a real calendar date', () => expect(() => checkedDate('2026-02-30')).toThrow());
 it('binds rota to Monday 9 November', () => expect(monday('2026-11-09')).toBe('2026-11-09'));
 it('rejects a silently selected Tuesday week', () => expect(() => monday('2026-11-10')).toThrow());
 it('never accepts an invented pay amount', () => expect(() => instructedPay('Set Ken Chan pay to HK$800',900)).toThrow());
 it('uses precisely the human HK$800 amount', () => expect(() => instructedPay('Set Ken Chan pay to HK$800',800)).not.toThrow());
 it('rejects pay advice even with a number', () => expect(() => instructedPay('Recommend HK$800 bonus',800)).toThrow());
 it('does not expose payroll approval', () => expect(PEOPLE_OPERATIONS).not.toContain('payroll_approve'));
 it('requires explicitly established venue', () => expect(() => establishedScope('Ken off Monday','Assembly','venue')).toThrow());
 it('keeps the explicitly named venue', () => expect(() => establishedScope('Ken off at Assembly','Assembly','venue')).not.toThrow());
 it('asks rather than selecting an unspecified month', () => expect(() => establishedPeriod('prepare a month','2026-05','month')).toThrow());
 it('accepts the explicitly stated May 2026', () => expect(() => establishedPeriod('Prepare May 2026','2026-05','month')).not.toThrow());
});