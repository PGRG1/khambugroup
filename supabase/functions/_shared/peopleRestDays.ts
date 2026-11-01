type EvidenceRow = Record<string, any>;
type PersonEvidence = {shifts: EvidenceRow[]; attendance: EvidenceRow[]; today: string};
type LeaveLine = {id:string;date:string|null;event:string;al:number;sh:number;kind:string;how:string;author:string;source:string;due?:string};
const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const weekStart=(day:string)=>addDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7));
const weekDays=(day:string)=>Array.from({length:7},(_,i)=>addDays(weekStart(day),i));
const shiftHours=(s:EvidenceRow)=>{if((s.shift_type??'regular')!=='regular')return 0;const minutes=(t:string)=>{const [h,m]=String(t??'00:00').split(':').map(Number);return h*60+m;};let duration=minutes(s.end_time)-minutes(s.start_time);if(duration<0)duration+=1440;return Math.max(0,duration-Number(s.break_minutes??0))/60;};
const off = (s: EvidenceRow) => ['off','rest','rest_day','rd'].includes(String(s.shift_type).toLowerCase());
export function restDayMetrics(person: EvidenceRow, data: PersonEvidence) {
  const shifts = data.shifts.filter(s => s.employee_id === person.id && s.status !== 'cancelled' && s.shift_date <= data.today);
  const attendance = data.attendance.filter(a => a.employee_id === person.id && a.clock_in && a.date <= data.today);
  const worked = new Set([...shifts.filter(s => shiftHours(s) > 0 && !s.no_show).map(s => s.shift_date), ...attendance.map(a => a.date)]);
  const observed = new Set([...shifts.map(s => s.shift_date), ...attendance.map(a => a.date)]);
  const weeks = [...new Set([...observed].map(weekStart))].sort();
  const credits: {date: string; source: string}[] = [];
  // Missing records are not days off. An extra rest day needs an explicit off marker.
  for (const week of weeks) {
    const days = weekDays(week), end = days[6];
    if (end > data.today) continue;
    const daysOff = days.filter(d => !worked.has(d) && shifts.some(s => s.shift_date === d && off(s)));
    const substitutes = daysOff.filter(d => shifts.some(s => s.shift_date === d && (s.is_substitute_rest_day || /substitute rest|substitute rd/i.test(String(s.notes ?? '')))));
    for (const date of substitutes) credits.push({date, source:'Rota · substitute rest day'});
    if (days.every(d => observed.has(d))) {
      // One ordinary rest day is not repayment. Each extra off day can settle one older debt.
      for (const date of daysOff.filter(d => !substitutes.includes(d)).slice(1)) credits.push({date:end, source:'Rota · period with two or more days off'});
    }
  }
  // Explicit substitute rest days also work in a partly recorded current week.
  for (const s of shifts.filter(s => off(s) && !worked.has(s.shift_date) && (s.is_substitute_rest_day || /substitute rest|substitute rd/i.test(String(s.notes ?? ''))))) {
    if (!credits.some(c => c.date === s.shift_date && c.source.includes('substitute'))) credits.push({date:s.shift_date,source:'Rota · substitute rest day'});
  }
  credits.sort((a,b)=>a.date.localeCompare(b.date));
  const lines: LeaveLine[] = [], outstanding: LeaveLine[] = [];
  for (const week of weeks) {
    const days=weekDays(week),end=days[6];
    if (end > data.today || !days.every(d=>worked.has(d))) continue;
    const due=addDays(end,30);
    const line: LeaveLine={id:`rd-${person.id}-${end}`,date:end,event:`Rest day owed · worked all 7 days, ${week}–${end}`,al:0,sh:0,kind:'RD',how:'Rest day owed',author:'Not recorded',source:attendance.some(a=>days.includes(a.date))?'Rota / clock-in':'Rota',due};
    lines.push(line);
    const credit=credits.findIndex(c=>c.date>end && c.date<=due);
    if(credit<0)outstanding.push(line);
    else {const [given]=credits.splice(credit,1);lines.push({...line,id:`${line.id}-given`,date:given.date,event:`Rest day given · settles week ending ${end}`,how:'Rest day given',source:given.source});}
  }
  return {owed:outstanding.length,outstanding,lines};
}
