import {describe,it,expect} from 'vitest';
import {defaultScheduleSettings,hkProfitsTax,monthlyDepreciation,deferredMovement,stockAdjustment,validJournalSource} from '@/utils/financeSchedules';
describe('Finance schedules',()=>{
it('capitalisation defaults to 5000',()=>expect(defaultScheduleSettings.capitalisation_limit).toBe(5000));
it('voucher expiry defaults to 12 months',()=>expect(defaultScheduleSettings.voucher_expiry_months).toBe(12));
it('stock adjustments are off by default',()=>{expect(defaultScheduleSettings.stock_basis).toBe('purchases');expect(stockAdjustment('purchases',20000,10000)).toBe(0);});
it('opt-in counts use the change in approved value',()=>expect(stockAdjustment('counts',20000,10000)).toBe(10000));
it('company two tier applies 8.25 and 16.5 percent',()=>{expect(hkProfitsTax(2000000,'company')).toBe(165000);expect(hkProfitsTax(3000000,'company')).toBe(330000);});
it('unincorporated two tier applies 7.5 and 15 percent',()=>{expect(hkProfitsTax(2000000,'unincorporated')).toBe(150000);expect(hkProfitsTax(3000000,'unincorporated')).toBe(300000);});
it('year end defaults to 31 March HK',()=>{expect(defaultScheduleSettings.year_end_month).toBe(3);expect(defaultScheduleSettings.year_end_day).toBe(31);expect(defaultScheduleSettings.jurisdiction).toBe('HK');});
it('sold used expiry remain drafts and exhaust liability correctly',()=>{const sold=deferredMovement(0,1000,'sold');expect(sold).toEqual({balance:1000,deferredDebit:0,deferredCredit:1000,status:'waiting'});const used=deferredMovement(sold.balance,400,'used');expect(used.balance).toBe(600);expect(deferredMovement(used.balance,600,'expiry').balance).toBe(0);});
it('cannot redeem more than balance',()=>expect(()=>deferredMovement(100,101,'used')).toThrow());
it('depreciation is straight line and capped by remaining value',()=>{expect(monthlyDepreciation(12000,0,12,0)).toBe(1000);expect(monthlyDepreciation(12000,0,12,11500)).toBe(500);});
it('manual proposals require evidence or written reason',()=>{expect(validJournalSource('','','')).toBe(false);expect(validJournalSource('opening asset','','')).toBe(true);});
});
