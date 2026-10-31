import {describe,it,expect} from 'vitest';
import {payrollAmounts,payrollApprovalAllowed,payrollPayChangeAllowed,payrollPeriod,payrollExceptions,profileReliability} from '@/utils/peoplePayroll';
describe('Payroll rules',()=>{
 it('preserves existing 5% MPF and HK$1500 cap',()=>{expect(payrollAmounts(40000)).toEqual({gross:40000,ee:1500,er:1500,net:38500,cost:41500});});
 it('preserves override and existing gross/net composition',()=>{expect(payrollAmounts(7040,0,0,0,0,800,0)).toEqual({gross:7840,ee:392,er:392,net:7448,cost:8232});});
 it('keeps employee and employer MPF overrides',()=>{expect(payrollAmounts(18000,0,0,0,0,0,100,0,500).net).toBe(17900);});
 it('strict approval requires a different owner',()=>{expect(payrollApprovalAllowed('strict',true,'a','a')).toBe(false);expect(payrollApprovalAllowed('strict',true,'a','b')).toBe(true);});
 it('managed approval follows existing owner review rule',()=>{expect(payrollApprovalAllowed('managed',false,'a','b')).toBe(false);expect(payrollApprovalAllowed('managed',true,'a','a')).toBe(true);});
 it('owner can change pay even when manager changes are off',()=>{expect(payrollPayChangeAllowed(true,false,false)).toBe(true);expect(payrollPayChangeAllowed(false,true,false)).toBe(false);});
 it('every override is an approval exception even if net stayed unchanged',()=>{expect(payrollExceptions([{employee_id:'p',net_salary:100}], [{employee_id:'p',net_salary:100}],[{employee_id:'p',previous_value:0,new_value:800,reason:'cover',repeat:false}])[0].changed).toBe(true);});
 it('month bounds cross year correctly',()=>{expect(payrollPeriod(2026,12)).toEqual({start:'2026-12-01',end:'2026-12-31'});});
 it('unmodified previous-month pay is not a check',()=>{expect(payrollExceptions([{employee_id:'p',net_salary:100}],[{employee_id:'p',net_salary:100}],[])[0].changed).toBe(false);});
});
describe('Eight-week factual reliability',()=>{
 const p={id:'p',hire_date:'2020-01-01',weekly_hours:45};const shift=(date:string)=>({id:date,employee_id:'p',shift_date:date,start_time:'09:00:00',end_time:'17:00:00',shift_type:'regular',no_show:false});
 it('clock off never claims reliable attendance',()=>{expect(profileReliability(p,[],[shift('2026-10-30')],[],[],'2026-10-31',false).unknown).toBe(true);});
 it('missing clock-ins are not inferred no-shows',()=>{const r=profileReliability(p,[],[shift('2026-10-30')],[],[],'2026-10-31',true);expect(r.noShows).toBe(0);expect(r.unknown).toBe(true);});
 it('records actual late minutes and excludes old shifts',()=>{const r=profileReliability(p,[],[shift('2026-10-30'),shift('2026-09-01')],[{employee_id:'p',date:'2026-10-30',clock_in:'2026-10-30T01:12:00Z'}],[],'2026-10-31',true);expect(r.recorded).toBe(1);expect(r.late).toEqual([{date:'2026-10-30',minutes:12}]);expect(r.onTime).toBe(0);expect(r.unknown).toBe(false);});
 it('counts only approved cover in the window',()=>{expect(profileReliability(p,[],[shift('2026-10-30')],[],[{shift_id:'2026-10-30',replacement_employee_id:'p',status:'approved'}],'2026-10-31',true).covered).toBe(1);});
});