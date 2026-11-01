type Row=Record<string,any>;
import {restDayMetrics} from './peopleRestDays.ts';
export function addOwedRestToDraft(changes:Row[],current:Row[],history:Row[],attendance:Row[],people:Row[],start:string,today:string,leave:Row[]) {
 const draft=changes.map(c=>({...c}));
 for(const person of people){
  const debts=restDayMetrics(person,{shifts:history,attendance,today}).outstanding;
  const used=new Set<string>();
  for(const debt of debts){
   const eligible=draft.filter(c=>c.employee_id===person.id&&c.shift_date>=start&&!used.has(c.shift_date)&&!current.some(s=>s.employee_id===person.id&&s.shift_date===c.shift_date)&&!leave.some(l=>l.employee_id===person.id&&l.status==='approved'&&l.start_date<=c.shift_date&&l.end_date>=c.shift_date));
   // Reuse an ordinary rest day first, otherwise replace one proposed (never saved) shift.
   const chosen=eligible.find(c=>c.shift_type==='RD')??eligible.filter(c=>c.shift_type==='regular').sort((a,b)=>a.shift_date.localeCompare(b.shift_date))[0];
   if(!chosen)continue;
   used.add(chosen.shift_date);chosen.shift_type='RD';chosen.start_time='00:00';chosen.end_time='00:00';chosen.break_minutes=0;chosen.notes=`Substitute rest day for week ending ${debt.date}; give by ${debt.due}`;
  }
 }
 return draft;
}
export function usualRotaDraft(history:Row[],current:Row[],start:string,leave:Row[]){const recent=history.filter(s=>s.shift_date<start&&s.shift_date>=new Date(Date.parse(start+'T00:00:00Z')-28*86400000).toISOString().slice(0,10)&&s.status!=='cancelled').sort((a,b)=>b.shift_date.localeCompare(a.shift_date));const picked=new Set<string>();return recent.flatMap(s=>{const weekday=(new Date(s.shift_date+'T00:00:00Z').getUTCDay()+6)%7;const day=new Date(Date.parse(start+'T00:00:00Z')+weekday*86400000).toISOString().slice(0,10),key=s.employee_id+'|'+day;if(picked.has(key)||current.some(c=>c.employee_id===s.employee_id&&c.shift_date===day))return [];picked.add(key);if(leave.some(l=>l.employee_id===s.employee_id&&l.status==='approved'&&l.start_date<=day&&l.end_date>=day))return [];return [{employee_id:s.employee_id,shift_date:day,start_time:s.start_time,end_time:s.end_time,break_minutes:s.break_minutes,shift_type:s.shift_type,role:s.role}];});}
