import {describe,it,expect} from 'vitest';
import {deferredSalesAmounts,enabledDeferredFields} from '@/utils/deferredSales';
import {defaultScheduleSettings} from '@/utils/financeSchedules';
describe('Deferred sales feed',()=>{
 it('only enabled voucher/deposit types show fields',()=>{expect(enabledDeferredFields(defaultScheduleSettings)).toHaveLength(0);expect(enabledDeferredFields({...defaultScheduleSettings,voucher_enabled:true}).map(f=>f[0])).toEqual(['vouchersSold','vouchersUsed']);});
 it('sold/taken removes revenue and used restores revenue without changing printed sales',()=>{const r={subtotal:2000,vouchersSold:500,depositsTaken:100,vouchersUsed:200,depositsUsed:50};expect(deferredSalesAmounts(r)).toEqual({sold:600,used:250,revenueAdjustment:-350});expect(r.subtotal).toBe(2000);});
 it('invalid fractional cents and negative liability amounts fail',()=>{expect(()=>deferredSalesAmounts({vouchersSold:-1})).toThrow();expect(()=>deferredSalesAmounts({depositsTaken:1.001})).toThrow();});
});