import {describe,it,expect} from 'vitest';
import {probablyMisreadDate,canCloseMonth,plGroup,typedPosting,reportMonths,type MonthCheck} from '@/utils/financeClose';
describe('Finance close rules',()=>{
 it('flags dates before the first sales record',()=>expect(probablyMisreadDate('2026-01-01','2026-02-01','2026-10-31')).toBe(true));
 it('does not flag exactly 60 days ahead',()=>expect(probablyMisreadDate('2026-12-30','2026-01-01','2026-10-31')).toBe(false));
 it('flags more than 60 days ahead',()=>expect(probablyMisreadDate('2026-12-31','2026-01-01','2026-10-31')).toBe(true));
 const check={month:'2026-09',complete:true} as MonthCheck;
 it('allows a complete past month',()=>expect(canCloseMonth(check,'2026-10-31')).toBe(true));
 it('never closes the current month',()=>expect(canCloseMonth({...check,month:'2026-10'},'2026-10-31')).toBe(false));
 it('never closes an incomplete month',()=>expect(canCloseMonth({...check,complete:false},'2026-10-31')).toBe(false));
 it('includes other expenses in running costs',()=>expect(plGroup('other_expense')).toBe('Running costs'));
 it('preserves negative typed cost signs as debits',()=>expect(typedPosting(-336)).toEqual({debit:336,credit:0}));
 it('preserves positive typed amounts as credits',()=>expect(typedPosting(160)).toEqual({debit:0,credit:160}));
 it('includes missing months and cross-year periods',()=>expect(reportMonths([], '2025-12-01','2026-02-28')).toEqual(['2025-12','2026-01','2026-02']));
});