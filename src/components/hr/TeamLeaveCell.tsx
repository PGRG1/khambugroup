import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { personMetrics, type EvidenceRow, type PersonEvidence, type LeaveLine } from '@/utils/peopleRecord';
import { dueSoon, restDayMetrics } from '@/utils/peopleAttendance';
import { formatDate, formatDecimal } from '@/utils/format';

export function TeamLeaveCell({person,data}:{person:EvidenceRow;data:PersonEvidence}) {
  const m=personMetrics(person,data),rd=restDayMetrics(person,data);
  const owed=(label:string,lines:LeaveLine[],limit:number)=>{
    const text=`${label} ${formatDecimal(lines.length,0)} owed`;
    if(!lines.length)return <span>{text}</span>;
    return <HoverCard openDelay={150}><HoverCardTrigger asChild><Button variant="ghost" className={`h-auto p-0 font-normal text-xs ${lines.some(l=>dueSoon(l.due,data.today))?'text-warning':'text-foreground'}`}>{text}</Button></HoverCardTrigger><HoverCardContent className="max-w-[calc(100vw-32px)] w-80 bg-card text-card-foreground border-border shadow-sm text-sm" align="end">{lines.map((l,i)=><p key={`${l.id}-${i}`} className="mb-2 last:mb-0">{l.event}{l.date?` · ${formatDate(l.date)}`:''}. {l.due?`Give ${label==='RD'?'a rest day':'a holiday'} by ${formatDate(l.due)} (within ${limit} days).`:'Give-by date not recorded.'}</p>)}</HoverCardContent></HoverCard>;
  };
  return <div className="team-leave-line text-xs"><span className={m.left==null?'text-muted-foreground':''}>{m.left==null?'AL not set':`AL ${formatDecimal(m.left,m.left%1?1:0)} left`}</span><span className="text-muted-foreground"> · </span>{owed('SH',m.outstanding,60)}<span className="text-muted-foreground"> · </span>{owed('RD',rd.outstanding,30)}</div>;
}