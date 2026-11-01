import { addDays } from '@/utils/peopleRota';
import { reliabilityLines, type EvidenceRow, type PersonEvidence } from '@/utils/peopleRecord';

export { restDayMetrics } from '../../supabase/functions/_shared/peopleRestDays';
export const dueSoon = (due: string | undefined, today: string) => Boolean(due && due <= addDays(today,14));
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