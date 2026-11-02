import {it,expect} from 'vitest';
import {deferredSalesAmounts} from '@/utils/deferredSales';
it('moves sold amounts out of earned sales and releases used amounts',()=>expect(deferredSalesAmounts({vouchersSold:100,depositsTaken:200,vouchersUsed:40,depositsUsed:60})).toEqual({sold:300,used:100,revenueAdjustment:-200}));
it('rejects negative and fractional cent deferred amounts',()=>{expect(()=>deferredSalesAmounts({vouchersSold:-1})).toThrow();expect(()=>deferredSalesAmounts({depositsUsed:1.001})).toThrow();});