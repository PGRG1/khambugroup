import { addDaysIso } from '@/utils/salesRecordChecks';
import { formatCurrency, formatDate, formatMonthLabel } from '@/utils/format';
import type { PageWorkItem } from '@/utils/baniPageWork';

export type EvidenceRow = Record<string, any>;
export type LeaveLine = { id: string; date: string | null; event: string; al: number; sh: number; kind: string; how: string; author: string; source: string; days?: number; year?: number; due?: string; conflict?: string; alLeft?: number | null; shOwed?: number };
export type PersonEvidence = { shifts: EvidenceRow[]; requests: EvidenceRow[]; leave: EvidenceRow[]; ledger: EvidenceRow[]; holidays: EvidenceRow[]; payroll: EvidenceRow[]; attendance: EvidenceRow[]; swaps: EvidenceRow[]; terms: EvidenceRow[]; today: string };
const normal = (v: unknown) => String(v ?? '').toLowerCase().replace(/[ -]/g, '_');
export function leaveKind(value: unknown): string {
  const v = normal(value);
  if (['al','annual_leave','annual'].includes(v)) return 'AL';
  if (['sl','sick_leave','sick','sickness'].includes(v)) return 'SL';
  if (['sh','statutory_holidays','statutory_holiday'].includes(v)) return 'SH';
  if (['npl','no_pay','unpaid','unpaid_leave','no_pay_leave'].includes(v)) return 'NPL';
  return '';
}
export const personName = (p: EvidenceRow) => `${p.first_name} ${p.last_name}`.trim();
export function leaveStatement(person: EvidenceRow, data: PersonEvidence): LeaveLine[] {
  const id = person.id, lines: LeaveLine[] = [], occupied = new Set<string>();
  const labels: Record<string,string> = { AL:'Annual leave', SL:'Sick leave', SH:'Substitute statutory holiday', NPL:'No-pay leave' };
  // A dated ledger is authoritative for its kind/day; requests and rota fill its gaps.
  for (const l of data.ledger.filter(l=>l.employee_id===id)) {
    const kind=leaveKind(l.leave_type?.name); if(!kind)continue;
    occupied.add(`${kind}|${l.entry_date}`);
    lines.push({id:l.id,date:l.entry_date,event:l.description||labels[kind],al:kind==='AL'?Number(l.accrued)-Number(l.taken):0,sh:kind==='SH'?Number(l.accrued)-Number(l.taken):0,kind,days:Number(l.taken),how:normal(l.description).includes('paid')?'Recorded payment':'Day off',author:l.created_by??'Not recorded',source:'Leave ledger'});
  }
  for (const r of data.requests.filter(r=>r.employee_id===id&&r.status==='approved')) {
    const kind=leaveKind(r.leave_type?.name); if(!kind)continue;
    const dates: string[]=[];
    for(let day=r.start_date;day<=r.end_date;day=addDaysIso(day,1)) if(!occupied.has(`${kind}|${day}`))dates.push(day);
    if(!dates.length)continue;
    const days=Math.min(dates.length,Number(r.days??r.total_days??dates.length));
    dates.forEach(day=>occupied.add(`${kind}|${day}`));
    lines.push({id:r.id,date:r.start_date,event:`${labels[kind]} · ${formatDate(r.start_date)}–${formatDate(r.end_date)} · ${days} days`,al:kind==='AL'?-days:0,sh:kind==='SH'?-days:0,kind,days,how:'Day off',author:r.approved_by??'Not recorded',source:'Leave request'});
  }
  const days = new Map<string,EvidenceRow>();
  for(const s of data.shifts.filter(s=>s.employee_id===id&&s.status!=='cancelled'&&s.shift_date<=data.today)) {
    const kind=leaveKind(s.shift_type); if(kind&&!occupied.has(`${kind}|${s.shift_date}`))days.set(`${kind}|${s.shift_date}`,s);
  }
  const sorted=[...days.values()].sort((a,b)=>a.shift_date.localeCompare(b.shift_date));
  for(const s of sorted) {
    const kind=leaveKind(s.shift_type), previous=lines[lines.length-1];
    // Adjacent rota days remain one evidence line, never double count two shifts on one day.
    if(previous?.source==='Rota'&&previous.kind===kind&&previous.date&&previous.id.endsWith(addDaysIso(s.shift_date,-1))) {
      previous.al+=kind==='AL'?-1:0;previous.sh+=kind==='SH'?-1:0;previous.days=Number(previous.days??1)+1;previous.id=`rota-${kind}-${s.shift_date}`;
      previous.event=`${labels[kind]} · ${formatDate(previous.date)}–${formatDate(s.shift_date)}`;
    } else lines.push({id:`rota-${kind}-${s.shift_date}`,date:s.shift_date,event:labels[kind],al:kind==='AL'?-1:0,sh:kind==='SH'?-1:0,kind,days:1,how:'Day off',author:s.hours_confirmed_by??'Not recorded',source:'Rota'});
  }
  const worked = new Set<string>();
  for(const h of data.holidays.filter(h=>h.is_active!==false&&normal(h.holiday_type)==='statutory'&&h.date<=data.today)) {
    const s=data.shifts.find(s=>s.employee_id===id&&s.shift_date===h.date&&s.status!=='cancelled'&&!s.no_show&&!leaveKind(s.shift_type)&&!['off','rest','rest_day'].includes(normal(s.shift_type))&&s.start_time!==s.end_time);
    if(!s||worked.has(h.date)||lines.some(l=>l.kind==='SH'&&l.date===h.date&&l.sh>0))continue;
    worked.add(h.date);lines.push({id:`holiday-${h.id}`,date:h.date,event:`Statutory holiday worked · ${h.name}`,al:0,sh:1,kind:'SH',how:'Holiday owed',author:s.hours_confirmed_by??'Not recorded',source:'Rota + holiday calendar',due:addDaysIso(h.date,60)});
  }
  for(const p of data.payroll.filter(p=>p.employee_id===id)) {
    const month=`${p.year}-${String(p.month).padStart(2,'0')}`, annual=lines.filter(l=>l.kind==='AL'&&l.al<0&&l.date?.startsWith(month));
    if(Number(p.unpaid_leave_deduction)>0) {
      const npl=lines.some(l=>l.kind==='NPL'&&l.date?.startsWith(month));
      const conflict=annual.length?`rota: AL · payroll: no-pay · ${formatCurrency(p.unpaid_leave_deduction)} · ${formatMonthLabel(month)}`:undefined;
      annual.forEach(l=>l.conflict=conflict);
      lines.push({id:`payroll-npl-${p.id}`,date:null,year:p.year,event:npl?`No-pay leave deduction · ${formatMonthLabel(month)}`:`No-pay leave deducted in payroll, dates not recorded · ${formatMonthLabel(month)}`,al:0,sh:0,kind:'NPL',how:`Deducted ${formatCurrency(p.unpaid_leave_deduction)}`,author:'Not recorded',source:'Saved payroll',conflict});
    }
    // Money alone never proves how many holiday days were paid. Only explicit linked dates settle owed days.
    const annualDates=Array.isArray(p.preparation?.annual_leave_paid_dates)?p.preparation.annual_leave_paid_dates:[];
    if(Number(p.annual_leave_pay)>0)lines.push({id:`payroll-al-${p.id}`,date:annualDates[0]??null,year:p.year,event:`Annual leave pay · ${formatMonthLabel(month)}${annualDates.length?'':' · leave dates not recorded'}`,al:annualDates.length?-annualDates.length:0,sh:0,kind:'AL',how:`Paid ${formatCurrency(p.annual_leave_pay)}`,author:'Not recorded',source:`Saved payroll · ${p.id}`});
    const paidDates=Array.isArray(p.preparation?.statutory_holiday_paid_dates)?p.preparation.statutory_holiday_paid_dates:[];
    if(Number(p.statutory_holiday_pay)>0)lines.push({id:`payroll-sh-${p.id}`,date:paidDates[0]??null,event:`Statutory holiday pay · ${formatMonthLabel(month)}${paidDates.length?'':' · holiday dates not recorded'}`,al:0,sh:-paidDates.length,kind:'SH',how:`Paid ${formatCurrency(p.statutory_holiday_pay)} · ${formatMonthLabel(month)}`,author:'Not recorded',source:'Saved payroll'});
  }
  // Undated imported balances cannot be presented as a dated entitlement award.
  for(const b of data.leave.filter(b=>b.employee_id===id&&leaveKind(b.leave_type?.name)==='AL')) {
    if(!lines.some(l=>l.kind==='AL'&&l.al>0&&l.date?.startsWith(String(b.year))))lines.push({id:`balance-${b.id}`,date:null,year:b.year,event:`Annual leave entitlement · ${b.year} · award date not recorded`,al:Number(b.total_days)+Number(b.carried_forward??0)+Number(b.adjustments??0),sh:0,kind:'AL',how:'Recorded balance',author:'Not recorded',source:'Leave balance'});
    const datedTaken=-lines.filter(l=>l.kind==='AL'&&l.date?.startsWith(String(b.year))&&l.al<0).reduce((n,l)=>n+l.al,0);
    if(Number(b.used_days)>datedTaken)lines.push({id:`used-${b.id}`,date:null,year:b.year,event:`Annual leave taken · ${b.year} · dates not recorded`,al:-(Number(b.used_days)-datedTaken),sh:0,kind:'AL',how:'Recorded balance',author:'Not recorded',source:'Leave balance'});
  }
  if(!data.leave.some(b=>b.employee_id===id&&leaveKind(b.leave_type?.name)==='AL')&&person.annual_leave!=null)lines.push({id:`terms-${id}`,date:null,year:Number(data.today.slice(0,4)),event:`Annual leave entitlement · ${data.today.slice(0,4)} · dated award not recorded`,al:Number(person.annual_leave),sh:0,kind:'AL',how:'Recorded employment terms',author:'Not recorded',source:'Employment terms'});
  lines.sort((a,b)=>(a.date??'').localeCompare(b.date??'')||a.id.localeCompare(b.id));
  const known=data.leave.some(b=>b.employee_id===id&&leaveKind(b.leave_type?.name)==='AL')||person.annual_leave!=null;
  const balances=new Map<number,number>();let sh=0;
  return lines.map(l=>{const y=l.year??Number(l.date?.slice(0,4)??data.today.slice(0,4));const al=(balances.get(y)??0)+l.al;balances.set(y,al);sh+=l.sh;return {...l,alLeft:known?al:null,shOwed:Math.max(0,sh)};});
}
export function personMetrics(person: EvidenceRow,data:PersonEvidence) {
  const year=data.today.slice(0,4), all=leaveStatement(person,data), lines=all.filter(l=>l.date?l.date.startsWith(year)&&l.date<=data.today:String(l.year??'')===year||l.event.includes(year));
  const balance=data.leave.find(b=>b.employee_id===person.id&&String(b.year)===year&&leaveKind(b.leave_type?.name)==='AL');
  const taken=Math.abs(lines.filter(l=>l.al<0).reduce((n,l)=>n+l.al,0));
  const entitlement=balance?Number(balance.total_days)+Number(balance.carried_forward??0)+Number(balance.adjustments??0):person.annual_leave==null?null:Number(person.annual_leave);
  const owed=all.filter(l=>l.sh>0).flatMap(l=>Array.from({length:l.sh},()=>l));
  let cleared=-all.filter(l=>l.sh<0).reduce((n,l)=>n+l.sh,0);
  // FIFO only for recorded substitute days; retain each outstanding holiday's deadline.
  const outstanding=owed.filter(()=>cleared-->0?false:true);
  const sick=lines.filter(l=>l.kind==='SL').reduce((n,l)=>n+Number(l.days??1),0);
  return {all,lines,entitlement,taken,left:entitlement==null?null:entitlement-taken,shSoFar:lines.filter(l=>l.sh>0).reduce((n,l)=>n+l.sh,0),shTaken:Math.abs(lines.filter(l=>l.sh<0).reduce((n,l)=>n+l.sh,0)),shOwed:outstanding.length,outstanding,sick};
}
export function reliabilityLines(person:EvidenceRow,data:PersonEvidence,clock:boolean) {
  const lines:LeaveLine[]=[], cutoff=addDaysIso(data.today,-56);
  for(const s of data.shifts.filter(s=>s.employee_id===person.id&&s.shift_date>=cutoff&&s.shift_date<data.today&&s.status!=='cancelled'&&!leaveKind(s.shift_type)&&!['off','rest','rest_day'].includes(normal(s.shift_type)))) {
    const a=data.attendance.find(a=>a.employee_id===person.id&&a.date===s.shift_date);
    if(s.no_show||clock&&data.attendance.some(a=>a.venue_id===s.venue_id&&a.clock_in)&&!a?.clock_in)lines.push({id:s.id,date:s.shift_date,event:'No clock-in for rostered shift',al:0,sh:0,kind:'fact',how:s.no_show?'Recorded no-show':'Clock-in missing · check with manager',author:'Not recorded',source:'Rota'});
    if(clock&&a?.clock_in){const start=Date.parse(`${s.shift_date}T${s.start_time}+08:00`);let end=Date.parse(`${s.shift_date}T${s.end_time}+08:00`);if(end<=start)end+=86400000;const late=Math.round((Date.parse(a.clock_in)-start)/60000);if(late>0)lines.push({id:`late-${s.id}`,date:s.shift_date,event:`Late arrival · ${late} minutes`,al:0,sh:0,kind:'fact',how:'Clock-in',author:'Not recorded',source:'Attendance'});if(a.clock_out){const early=Math.round((end-Date.parse(a.clock_out))/60000);if(early>0)lines.push({id:`early-${s.id}`,date:s.shift_date,event:`Early leave · ${early} minutes`,al:0,sh:0,kind:'fact',how:'Clock-out',author:'Not recorded',source:'Attendance'});}}
  }
  for(const swap of data.swaps.filter(s=>s.replacement_employee_id===person.id&&s.status==='approved')) {const s=data.shifts.find(s=>s.id===swap.shift_id);if(s&&s.shift_date>=cutoff&&s.shift_date<=data.today)lines.push({id:swap.id,date:s.shift_date,event:'Shift covered',al:0,sh:0,kind:'fact',how:'Approved cover',author:swap.approved_by??'Not recorded',source:'Rota'});}
  return lines;
}
export function peopleFindings(people:EvidenceRow[],data:PersonEvidence):(PageWorkItem&{group?:string;groupTitle?:(n:number)=>string})[] {
  const findings:(PageWorkItem&{group?:string;groupTitle?:(n:number)=>string})[]=[];
  const add=(p:EvidenceRow,key:string,title:string,detail:string,question:string)=>findings.push({id:`${p.id}-${key}`,tone:'amber',title:`${personName(p)} · ${title}`,detail,label:'Check',question,group:`person-${key}`,groupTitle:(n:number)=>`${n} people: ${title.charAt(0).toLowerCase()}${title.slice(1)}`});
  for(const p of people) {
    if(!['active','on_leave'].includes(p.status))continue;
    const pay=data.payroll.filter(r=>r.employee_id===p.id).sort((a,b)=>a.year-b.year||a.month-b.month),last=pay[pay.length-1],latest=last?`${last.year}-${String(last.month).padStart(2,'0')}-01`:null;
    if(['active','on_leave'].includes(p.status)&&(!latest||latest<addDaysIso(data.today,-62)))add(p,'working','Still working here?',latest?`Last saved payroll: ${formatMonthLabel(latest.slice(0,7))}`:'No saved payroll',`Check whether ${personName(p)} is still working here. Last saved payroll ${latest??'not recorded'}. Ask me; do not change their status without confirmation.`);
    if(/promoters|runner foh|kitchen dishwasher|cleaner cleaner/i.test(personName(p)))add(p,'identity','Person or role?', 'Name looks like a role, not a person',`Is ${personName(p)} a person or a role entry? Ask me for the actual person; never guess or delete.`);
    const first=pay[0]?`${pay[0].year}-${String(pay[0].month).padStart(2,'0')}-01`:null;
    if(first&&first<p.hire_date&&first.slice(0,7)<p.hire_date?.slice(0,7))add(p,'start','Check recorded start date',`Started ${formatDate(p.hire_date)} · payroll from ${formatMonthLabel(first.slice(0,7))}`,`Review ${personName(p)} start date ${p.hire_date}: first saved payroll month is ${first.slice(0,7)}. Offer that month as evidence, not an exact date; ask before changing.`);
    const metrics=personMetrics(p,data);
    if(metrics.entitlement==null)add(p,'entitlement','Annual leave entitlement not set','No entitlement recorded',`Check Hong Kong statutory minimum annual leave for ${personName(p)} from recorded start ${p.hire_date}. State eligibility and service-year evidence; draft only for my confirmation. Do not invent pay.`);
    for(const conflict of new Set(metrics.all.map(l=>l.conflict).filter(Boolean)))add(p,'conflict','Leave records disagree',String(conflict),`Review ${personName(p)}: ${conflict}. Show evidence and ask what happened; do not change saved payroll or financial data.`);
  }
  return findings;
}