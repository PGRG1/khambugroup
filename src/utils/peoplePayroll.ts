import {addDays, shiftHours, personOnDate, punctualityFacts, type RotaRow} from '@/utils/peopleRota';

export function payrollAmounts(earned:number, overtime=0, bonus=0, annualLeave=0, unpaid=0, adjustment=0, other=0, eeOverride:number|null=null, erOverride:number|null=null) {
  const gross=earned+overtime+bonus+annualLeave-unpaid+adjustment;
  const ee=eeOverride??Math.min(1500,gross*0.05), er=erOverride??Math.min(1500,gross*0.05);
  return {gross,ee,er,net:gross-ee-other,cost:gross+er};
}
export function payrollApprovalAllowed(mode:string,owner:boolean,author:string|null,uid:string) {return owner&&(mode!=='strict'||Boolean(author&&author!==uid));}
export function payrollPayChangeAllowed(owner:boolean,manager:boolean,enabled:boolean) {return owner||(manager&&enabled);}
export function payrollPeriod(year:number,month:number) {const start=`${year}-${String(month).padStart(2,'0')}-01`;return {start,end:addDays(`${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,'0')}-01`,-1)};}
export function payrollExceptions(rows:RotaRow[],previous:RotaRow[],audits:RotaRow[]):(RotaRow & {reasons:string[];changed:boolean})[] {
  return rows.map(row=>{const old=previous.find(p=>p.employee_id===row.employee_id);const changes=audits.filter(a=>a.employee_id===row.employee_id);const reasons:string[]=[...(row.preparation?.reasons??[])];
    for(const a of changes)reasons.push(`Changed by manager: ${a.reason} (${a.previous_value} → ${a.new_value}), ${a.repeat?'every month':'this month only'}`);
    if(!old)reasons.push('First payroll record');else if(Math.abs(Number(row.net_salary)-Number(old.net_salary))>0.01&&!reasons.length)reasons.push('Pay differs from last month');
    return {...row,reasons:[...new Set(reasons)],changed:reasons.length>0};
  });
}
export function profileReliability(person:RotaRow,terms:RotaRow[],shifts:RotaRow[],attendance:RotaRow[],swaps:RotaRow[],today:string,clockEnabled:boolean) {
  const start=addDays(today,-55);const own=shifts.filter(s=>s.employee_id===person.id&&s.shift_date>=start&&s.shift_date<today&&shiftHours(s)>0);
  const observed=own.map(s=>({s,a:attendance.filter(a=>a.employee_id===person.id&&a.date===s.shift_date&&a.clock_in).sort((a,b)=>a.clock_in.localeCompare(b.clock_in))[0]}));
  const late=observed.filter(({s,a})=>a&&Date.parse(a.clock_in)>Date.parse(`${s.shift_date}T${s.start_time}+08:00`)).map(({s,a})=>({date:s.shift_date,minutes:Math.round((Date.parse(a.clock_in)-Date.parse(`${s.shift_date}T${s.start_time}+08:00`))/60000)}));
  const recorded=observed.filter(r=>r.a).length;const planned=own.reduce((n,s)=>n+shiftHours(s),0);
  let contract=0,known=true;for(let d=start;d<today;d=addDays(d,1)){const at=personOnDate(person,terms,d);if(at.hire_date>d||at.end_date&&at.end_date<d)continue;if(at.weekly_hours==null)known=false;else contract+=Number(at.weekly_hours)/7;}
  const covered=swaps.filter(s=>s.replacement_employee_id===person.id&&s.status==='approved'&&shifts.some(r=>r.id===s.shift_id&&r.shift_date>=start&&r.shift_date<today)).length;
  const departures=own.map(s=>({date:s.shift_date,...punctualityFacts(s,attendance.filter(a=>a.employee_id===person.id&&a.date===s.shift_date),new Date(`${today}T00:00:00+08:00`))})).filter(f=>f.earlyMinutes>0||f.extraMinutes>0);
  return {start,onTime:recorded-late.length,recorded,late,departures,noShows:clockEnabled?shifts.filter(s=>s.employee_id===person.id&&s.shift_date>=start&&s.shift_date<today&&s.no_show===true).length:null,covered,planned,contract:known?contract:null,unknown:!clockEnabled||recorded<own.length||recorded===0};
}