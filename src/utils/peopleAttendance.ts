import { addDays, weekDays, weekStart, shiftHours } from '@/utils/peopleRota';
import { reliabilityLines, type EvidenceRow, type PersonEvidence, type LeaveLine } from '@/utils/peopleRecord';

const off = (s: EvidenceRow) => ['off','rest','rest_day','rd'].includes(String(s.shift_type).toLowerCase());
export const dueSoon = (due: string | undefined, today: string) => Boolean(due && due <= addDays(today, 14));
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
export function attendanceMetrics(person: EvidenceRow, data: PersonEvidence) {
  const cutoff=addDays(data.today,-56);
  const own=data.shifts.filter(s=>s.employee_id===person.id && s.status!=='cancelled');
  const coverage=own.some(s=>s.shift_date>=cutoff && s.shift_date<=data.today) || data.attendance.some(a=>a.employee_id===person.id&&a.clock_in&&a.date>=cutoff&&a.date<=data.today);
  // A recorded clock-in is evidence even when the current venue setting is off.
  const lines=reliabilityLines(person,data,true);
  return {coverage,lastRota:own.filter(s=>s.shift_date<=data.today).map(s=>s.shift_date).sort().at(-1),lines,
    late:lines.filter(l=>l.id.startsWith('late-')).length,
    noShows:lines.filter(l=>l.event.includes('No clock-in')).length,
    early:lines.filter(l=>l.id.startsWith('early-')).length,
    covered:lines.filter(l=>l.event==='Shift covered').length};
}
export function employmentType(value: unknown) {
  return ({full_time:'Full-time',part_time:'Part-time',casual:'Casual'} as Record<string,string>)[String(value)] ?? String(value??'—').replace(/_/g,' ');
}