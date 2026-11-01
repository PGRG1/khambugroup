import {describe,it,expect} from 'vitest';
import {calculateWorkPay,savedWorkAmounts,bankBalance,settlementChoices,paidPerson,observedShift} from '@/utils/peopleWork';
const amounts={basic:20000,al:0,sh:0,sick:0,unpaid:0,overtime:0,other:0};
describe('work to pay rules',()=>{
 it('recalculates typed overtime immediately',()=>{expect(calculateWorkPay({...amounts,overtime:600})).toMatchObject({gross:20600,ee:1030,net:19570,cost:21630});});
 it('employee MPF is none below 7100; employer always 5 percent',()=>{expect(calculateWorkPay({...amounts,basic:7000})).toMatchObject({ee:0,er:350});expect(calculateWorkPay({...amounts,basic:7100})).toMatchObject({ee:355,er:355});});
 it('caps each MPF at 1500',()=>{expect(calculateWorkPay({...amounts,basic:40000})).toMatchObject({ee:1500,er:1500});});
 it('deductions stay negative',()=>{expect(calculateWorkPay({...amounts,unpaid:600})).toMatchObject({unpaid:-600,gross:19400});});
 it('saved May values are used without recalculating MPF',()=>{expect(savedWorkAmounts({actual_base_salary:20000,unpaid_leave_deduction:1790.3,gross_salary:18209.7,mpf_employee:0,mpf_employer:0,net_salary:18209.7})).toMatchObject({unpaid:-1790.3,ee:0,net:18209.7});});
 it('sums signed bank decisions only when source is current',()=>{const shifts=[{employee_id:'a',updated_at:'now',settlement:{source_updated_at:'now',settle:'bank',hours:2}},{employee_id:'a',updated_at:'now',settlement:{source_updated_at:'now',settle:'bank',hours:-1.5}},{employee_id:'a',updated_at:'later',settlement:{source_updated_at:'old',settle:'bank',hours:8}}];expect(bankBalance(shifts,'a').hours).toBe(.5);});
 it('overtime and left early permit pay or time',()=>{expect(settlementChoices('overtime')).toEqual(['pay','bank']);expect(settlementChoices('left_early')).toEqual(['pay','bank']);});
 it('statutory holiday never offers pay; no-show never offers bank',()=>{expect(settlementChoices('statutory_holiday')).toEqual(['bank']);expect(settlementChoices('no_show')).toEqual(['pay']);});
 it('excludes named non-person role records',()=>{for(const name of ['ASSEMBLY Promoters','Cleaner Cleaner','Kitchen Dishwasher','Runner FOH']){const [first_name,...last]=name.split(' ');expect(paidPerson({first_name,last_name:last.join(' ')})).toBe(false);}expect(paidPerson({first_name:'Anita',last_name:'Gurung'})).toBe(true);});
 it('does not turn missing clock-in into a day off',()=>{expect(observedShift({employee_id:'a',shift_date:'2026-11-01'},[])).toBeNull();});
});