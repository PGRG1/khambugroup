import { describe, expect, it } from 'vitest';
import { actionMonth, planningEnd, periodYears, journalDateException, monthSelection, periodMonths, shortcutSelection, validSessionSelection } from './periodWindow';
import { formatMonthLabel } from './format';
describe('shared period window', () => {
  it('bounds KHAMBU months from October 2025 through current month, newest first', () => {
    const months = periodMonths('2025-10-01', '2026-11-01');
    expect(months[0]).toBe('2026-11'); expect(months.at(-1)).toBe('2025-10'); expect(months).toHaveLength(14);
    expect(months).not.toContain('2028-07'); expect(months).not.toContain('2006-07');
  });
  it('only extends future planning with an explicit end month', () => { expect(periodMonths('2026-10', '2026-11-01', '2027-02')[0]).toBe('2027-02'); });
  it('clamps current-month end to today', () => { expect(monthSelection('2026-11', '2026-11-01', 'period').to).toBe('2026-11-01'); });
  it('uses the configured fiscal year', () => { expect(shortcutSelection('this-year', '2026-11-01', 4).from).toBe('2026-04-01'); expect(shortcutSelection('last-year', '2026-11-01', 4).to).toBe('2026-03-31'); });
  it('last 12 months includes twelve complete months', () => { expect(shortcutSelection('last-12', '2026-11-01')).toEqual({ from: '2025-11-01', to: '2026-10-31', key: 'last-12' }); });
  it('resets session selections the next day', () => { expect(validSessionSelection({ day: '2026-10-31', value: monthSelection('2026-10', '2026-10-31', 'month') }, '2026-11-01', '2025-10')).toBeUndefined(); });
  it('rejects out-of-window saved dates', () => { expect(validSessionSelection({ day: '2026-11-01', value: { from:'2006-07-01', to:'2028-07-22', key:'custom' } }, '2026-11-01', '2025-10')).toBeUndefined(); });
  it('flags before books and only more than 31 days ahead', () => { expect(journalDateException('2006-07-05','2025-10','2026-11-01')).toBe('before'); expect(journalDateException('2028-07-22','2025-10','2026-11-01')).toBe('after'); expect(journalDateException('2026-12-02','2025-10','2026-11-01')).toBeNull(); expect(journalDateException('2026-12-03','2025-10','2026-11-01')).toBe('after'); });
  it('uses Sep month labels', () => { expect(formatMonthLabel('2026-09')).toBe('Sep 2026'); });
  it('keeps current month visible even without invoice data',()=>{expect(periodMonths('2025-10-01','2026-11-02')).toContain('2026-11');});
  it('uses calendar years outside Finance',()=>{expect(shortcutSelection('this-year','2026-11-02').from).toBe('2026-01-01');});
  it('caps Targets at twelve future months and only actual planned dates',()=>{expect(planningEnd('2026-11-02',['2028-01'])).toBe('2027-11');expect(planningEnd('2026-11-02',['2027-03'])).toBe('2027-03');expect(planningEnd('2026-11-02',[])).toBe('2026-11');});
  it('bounds import years without future years',()=>{expect(periodYears('2025-10-01','2026-11-02')).toEqual([2026,2025]);});
  it('permits next year only for Leave planning',()=>{expect(periodYears('2025-10-01','2026-11-02',true)).toEqual([2027,2026,2025]);});
  it('opens current payroll while unapproved',()=>{expect(actionMonth('2026-11-02',[{month:'2026-05',approved:false}],'2025-10')).toBe('2026-11');});
  it('opens first unapproved payroll when current is approved',()=>{expect(actionMonth('2026-11-02',[{month:'2026-11',approved:true},{month:'2026-05',approved:false},{month:'2006-07',approved:false}],'2025-10')).toBe('2026-05');});
});