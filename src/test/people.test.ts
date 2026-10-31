import {describe,it,expect} from 'vitest';
import {peopleDefaults,resolvePeopleSettings,termsOnDate,needsOwnerApproval,canApprovePeople,documentExpiryDue,workingPerson,monthlyDatedPay,datedLeaveAccrual} from '../utils/people';
describe('People rules',()=>{
 it('keeps exact existing-tenant defaults',()=>expect(peopleDefaults).toEqual({rota:true,clock_in:'off',pay_hours:'rota',leave_requests:true,sick_notes:true,staff_app:false,payslips:false,managers_change_pay:true,reliability:true,approvals:'owner_run'}));
 it('venue overrides company and disabled staff app disables payslips',()=>expect(resolvePeopleSettings({rota:true,payslips:true},{rota:false})).toMatchObject({rota:false,payslips:false}));
 it('only owner confirming their own Owner-run change skips approval',()=>{expect(needsOwnerApproval('owner_run',true)).toBe(false);expect(needsOwnerApproval('owner_run',false)).toBe(true);expect(needsOwnerApproval('managed',true)).toBe(true);});
 it('Strict requires a different owner',()=>{expect(canApprovePeople('strict',true,'a','a')).toBe(false);expect(canApprovePeople('strict',true,'a','b')).toBe(true);expect(canApprovePeople('managed',false,'a','b')).toBe(false);});
 it('uses the effective rate on each date',()=>{const rows=[{effective_date:'2026-11-01',values:{pay_amount:18000,pay_basis:'month'}},{effective_date:'2026-11-16',values:{pay_amount:19000}}];expect(termsOnDate(rows,'2026-11-15').pay_amount).toBe(18000);expect(monthlyDatedPay(rows,2026,11)).toBeCloseTo(18500);});
 it('uses hourly rates for the day worked',()=>expect(monthlyDatedPay([{effective_date:'2026-12-01',values:{pay_amount:80,pay_basis:'hour'}}],2026,12,{'2026-12-01':8})).toBe(640));
 it('does not invent missing historical pay',()=>expect(monthlyDatedPay([],2026,1)).toBeNull());
 it('accrues dated leave without changing earlier entitlement',()=>expect(datedLeaveAccrual([{effective_date:'2026-01-01',values:{annual_leave:14}}],'2026-01-01','2026-12-31')).toBeCloseTo(14));
 it('reminds exactly 60 days before expiry, not 61',()=>{expect(documentExpiryDue('2026-12-30','2026-10-31')).toBe(true);expect(documentExpiryDue('2026-12-31','2026-10-31')).toBe(false);expect(documentExpiryDue('2026-10-01','2026-10-31')).toBe(true);});
 it('counts on-leave as working but not future starters',()=>{expect(workingPerson('on_leave','2026-01-01','2026-10-31')).toBe(true);expect(workingPerson('active','2026-11-02','2026-10-31')).toBe(false);});
});