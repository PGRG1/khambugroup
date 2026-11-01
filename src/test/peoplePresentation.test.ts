import {describe,it,expect} from 'vitest';
import {roleGroup,payTotals,monthStaffCost,canPrepareMonth,savedPayrollMonth,startingPayRows,crossVenueClashes,rotaOtherVenues,weekdayVenueHours} from '@/utils/peoplePresentation';
const shift=(id:string,v:string,date='2026-11-09',start='10:00',end='18:00')=>({id,venue_id:v,employee_id:'asim',shift_date:date,start_time:start,end_time:end,shift_type:'regular'});
describe('People role and saved payroll facts',()=>{
 it.each([['Bar Manager','Bar'],['Bartender','Bar'],['Server','Floor'],['Runner','Floor'],['Demi Chef','Kitchen'],['Dish Washer','Kitchen'],['Cook','Kitchen'],['Promotor','Promotions'],['Promoter','Promotions'],['Promoters','Promotions'],['General Manager','Management'],['Manager','Management'],['Cleaner','Cleaning'],[null,'No role set'],['Cook / Runner','No role set']])('maps %s without guessing ambiguous work',(title,role)=>expect(roleGroup(title)).toBe(role));
 it('May retains exact requested gross, net and MPF each',()=>expect(payTotals([{gross_salary:247407.70,net_salary:239747.20,mpf_employee:7660.50,mpf_employer:7660.50}])).toEqual({gross:247407.7,net:239747.2,ee:7660.5,er:7660.5,cost:255068.2}));
 it.each([[1,272988.3,9710.2,747100,37.8],[2,223282,7325,701267,32.9],[3,231520,7472.5,843131,28.3],[4,248744.3,7719.2,788095,32.5],[5,247407.7,7660.5,782251,32.6]])('2026 month %s matches real group staff cost percent',(month,gross,er,sales,percent)=>{const key=`2026-0${month}`;expect(Number(monthStaffCost([{year:2026,month,gross_salary:gross,mpf_employer:er}],[{date:key+'-01',total_sales:sales}],key).percent?.toFixed(1))).toBe(percent);});
 it('missing payroll is unknown not zero',()=>expect(monthStaffCost([],[{date:'2026-06-01',total_sales:100}],'2026-06').cost).toBeNull());
 it('opening saved May never permits preparation',()=>expect(canPrepareMonth([{year:2026,month:5}],2026,5,'2026-11-01')).toBe(false));
 it('only empty current due month can prepare on demand',()=>{expect(canPrepareMonth([],2026,11,'2026-11-01')).toBe(true);expect(canPrepareMonth([],2026,10,'2026-11-01')).toBe(false);});
 it('legacy rows are saved even with no month state',()=>expect(savedPayrollMonth([{year:2026,month:5,preparation:null}],2026,5)).toBe(true));
 it('new month starting point uses each persons last saved month without mutating it',()=>{const rows=[{id:'p',year:2026,month:5,employee_id:'asim',gross_salary:18500}];const before=JSON.stringify(rows);const result=startingPayRows(rows,[{id:'asim',first_name:'Asim',last_name:'RANA'}],'2026-11');expect(result[0].gross_salary).toBe(18500);expect(result[0].starting_month).toBe('2026-05');expect(JSON.stringify(rows)).toBe(before);});
 it('same-day other venue labels only list actual work',()=>{const vs=[{id:'a',name:'Assembly'},{id:'c',name:'Caliente'}];expect(rotaOtherVenues('asim','2026-11-09',vs[0],[shift('1','a'),shift('2','c')],vs,[],[])).toEqual(['Caliente']);expect(rotaOtherVenues('asim','2026-11-10',vs[0],[shift('1','a'),shift('2','c')],vs,[],[])).toEqual([]);});
 it('flags overlap at two venues',()=>expect(crossVenueClashes([shift('a','a'),shift('b','c')],['2026-11-09'])).toHaveLength(1));
 it('back-to-back venues do not clash',()=>expect(crossVenueClashes([shift('a','a','2026-11-09','10:00','14:00'),shift('b','c','2026-11-09','14:00','18:00')],['2026-11-09'])).toEqual([]));
 it('overnight overlapping shifts are checked across days',()=>expect(crossVenueClashes([shift('a','a','2026-11-09','22:00','03:00'),shift('b','c','2026-11-10','01:00','04:00')],['2026-11-09'])).toHaveLength(1));
 it('weekday hours use recorded rota weeks not pay',()=>{const result=weekdayVenueHours([shift('a','a'),shift('b','a','2026-11-16','10:00','14:00')],[{id:'a',name:'Assembly'}],[],[]);expect(result[0].weeks).toBe(2);expect(result[0].hours[0]).toBe(6);});
});
import {usualRotaDraft} from '../../supabase/functions/_shared/peopleRotaPattern';
describe('usual rota drafts',()=>{
 it('copies latest recorded same weekday without guessed hours',()=>{expect(usualRotaDraft([shift('old','a','2026-11-02','11:00','19:00')],[],'2026-11-09',[])[0]).toMatchObject({shift_date:'2026-11-09',start_time:'11:00',end_time:'19:00'});});
 it('preserves approved leave instead of adding work',()=>expect(usualRotaDraft([shift('old','a','2026-11-02')],[],'2026-11-09',[{employee_id:'asim',status:'approved',start_date:'2026-11-09',end_date:'2026-11-09'}])).toEqual([]));
 it('does not replace an existing shift',()=>expect(usualRotaDraft([shift('old','a','2026-11-02')],[shift('now','a')],'2026-11-09',[])).toEqual([]));
});
