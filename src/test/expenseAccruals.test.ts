import {describe,it,expect} from 'vitest';
import {contractPlan,splitCoverage,estimateFromBills,estimateReversal,prepaymentRelease} from '@/utils/expenseAccruals';
describe('expense accrual coverage',()=>{
 it('releases prepaid coverage monthly without exceeding funded balance',()=>{expect(prepaymentRelease(3100,'2026-05-18','2026-06-17','2026-05',3100)).toBe(1400);expect(prepaymentRelease(3100,'2026-05-18','2026-06-17','2026-06',1000)).toBe(1000);});
 it('spreads quarterly amount over three months',()=>expect(contractPlan({expected_amount:50000,cadence:'quarterly',effective_from:'2026-01-01'},'2026-01-01','2026-03-31').map(r=>r.amount)).toEqual([16666.67,16666.67,16666.67]));
 it('straight-lines free rent and steps over the evidenced term',()=>expect(contractPlan({expected_amount:380000,cadence:'monthly',effective_from:'2026-01-01',contract_end:'2026-12-31',rent_free_months:['2026-01'],step_increases:[{month:'2026-07',amount:400000}]},'2026-01-01','2026-12-31').map(r=>r.amount)).toEqual(Array(12).fill(358333.33)));
 it('splits 18 May–17 Jun by covered days and retains exact cents',()=>expect(splitCoverage(3100,'2026-05-18','2026-06-17')).toEqual([{month:'2026-05',days:14,amount:1400},{month:'2026-06',days:17,amount:1700}]));
 it('estimates using only the last three prior bills',()=>expect(estimateFromBills([{period:'2026-01',amount:900},{period:'2026-02',amount:100},{period:'2026-03',amount:200},{period:'2026-04',amount:300}], '2026-05')).toBe(200));
 it('reverses an estimate in full when actual bill is posted',()=>expect(estimateReversal({amount:200,expenseAccount:'power',accrualAccount:'accrued'},240)).toEqual({reversal:[{account:'power',debit:0,credit:200},{account:'accrued',debit:200,credit:0}],actualAmount:240,difference:40}));
});