import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download } from 'lucide-react';
import { usePeopleData } from '@/hooks/usePeopleData';
import { usePeopleSettings } from '@/hooks/usePeopleSettings';
import { useVenueScope } from '@/hooks/useVenueScope';
import { PeopleNavigation } from '@/components/hr/PeopleNavigation';
import { PeopleEvidenceDialog } from '@/components/hr/PeopleEvidenceDialog';
import { useBaniWorkPublisher, useBaniTopic } from '@/components/assistant/FloatingBaniContext';
import { personMetrics, peopleFindings, personName, reliabilityLines, type LeaveLine } from '@/utils/peopleRecord';
import { workingPerson } from '@/utils/people';
import { formatDate, formatDecimal, formatTableInteger } from '@/utils/format';
import { downloadCSV } from '@/utils/csvDownload';
import './people.css';
import {roleGroup} from '@/utils/peoplePresentation';
import {usePeopleGrouping} from '@/hooks/usePeopleGrouping';
import {PeopleGroupSwitch} from '@/components/hr/PeopleGroupSwitch';

export default function HREmployees() {
  const data=usePeopleData(),scope=useVenueScope(),settings=usePeopleSettings(),topic=useBaniTopic();
  const [groupBy,setGroupBy]=usePeopleGrouping(data.owner,data.loading);
  const [view,setView]=useState('working'),[search,setSearch]=useState(''),[popup,setPopup]=useState<{title:string;lines:LeaveLine[]}|null>(null);
  const venue=(p:any)=>scope.venues.find(v=>v.id===p.venue_id||v.name===p.venue)?.name??'Venue not recorded';
  const scoped=data.employees.filter(p=>venue(p)==='Venue not recorded'?scope.isAll:scope.includesName(venue(p)));
  const current=scoped.filter(p=>workingPerson(p.status,p.hire_date,data.today,p.end_date));
  const rows=scoped.filter(p=>(view==='working'?workingPerson(p.status,p.hire_date,data.today,p.end_date):!workingPerson(p.status,p.hire_date,data.today,p.end_date))&&`${personName(p)} ${p.job_title??''}`.toLowerCase().includes(search.toLowerCase()));
  const grouping=(p:any)=>groupBy==='Role'?roleGroup(p.job_title):venue(p);
  const groups=[...new Set(rows.map(grouping))].sort(),findings=peopleFindings(scoped,data);
  const unset=current.filter(p=>roleGroup(p.job_title)==='No role set');
  if(unset.length)findings.push({id:'people-roles',tone:'amber',title:`${unset.length} people need a role`,detail:unset.map(personName).join(' · '),label:'Check',question:`Ask me which role ${unset.map(personName).join(', ')} works in. Do not guess or suggest pay. Draft dated job title changes only for confirmation.`});
  useBaniWorkPublisher('/hr/employees',findings,!data.loading);
  const metricCells=(p:any)=>{const m=personMetrics(p,data),r=reliabilityLines(p,data,settings.forVenue(p.venue_id).clock_in!=='off');return [
    {label:'AL entitled',value:m.entitlement,lines:m.all.filter(l=>l.al>0)}, {label:'AL taken',value:m.taken,lines:m.lines.filter(l=>l.al<0)}, {label:'AL left',value:m.left,lines:m.lines.filter(l=>l.kind==='AL')}, {label:'SH so far',value:m.shSoFar,lines:m.lines.filter(l=>l.sh>0)}, {label:'SH taken',value:m.shTaken,lines:m.lines.filter(l=>l.sh<0)}, {label:'SH owed',value:m.shOwed,lines:m.outstanding}, {label:'Sick days',value:m.sick,lines:m.lines.filter(l=>l.kind==='SL')}, {label:'Reliability',value:r.length,lines:r}];};
  const count=(n:number)=>formatTableInteger(n);
  const summary=`${scope.isAll?'All venues':scope.selectedNames.join(' · ')} · ${count(current.length)} working${scope.isAll?` · ${[...new Set(current.map(venue))].sort().map(v=>`${v} ${count(current.filter(p=>venue(p)===v).length)}`).join(' · ')}`:''}`;
  return <div className="people-page kit space-y-4"><h1 className="font-display text-2xl font-semibold">People</h1><PeopleNavigation/>
    <section className="border border-border bg-card rounded-lg p-3 sm:p-4"><h2 className="font-display font-semibold">Team</h2><p className="text-sm text-muted-foreground mt-1" aria-label="Team summary">{summary}</p>
    <div className="flex flex-wrap items-center gap-2 my-4"><PeopleGroupSwitch value={groupBy} onChange={setGroupBy}/><div className="kit-seg">{['working','left'].map(v=><Button key={v} variant="ghost" aria-pressed={view===v} onClick={()=>setView(v)}>{v==='working'?'Working':'Left'}</Button>)}</div><Input aria-label="Search people" placeholder="Search people" className="flex-1 min-w-[130px]" value={search} onChange={e=>setSearch(e.target.value)}/><Button variant="outline" size="icon" aria-label="Download Team" onClick={()=>downloadCSV(rows.map(p=>({employee:personName(p),role:p.job_title,type:p.employment_type,venue:venue(p),started:p.hire_date})),[{key:'employee',label:'Employee'},{key:'role',label:'Role'},{key:'type',label:'Type'},{key:'venue',label:'Venue'},{key:'started',label:'Started'}],'team')}><Download className="h-4 w-4"/></Button></div>
    <table className="team-evidence-table"><thead><tr><th>Employee</th>{groupBy==='Role'&&<th>Works at</th>}<th>Type</th><th>Started</th>{['AL entitled','AL taken','AL left','SH so far','SH taken','SH owed','Sick days','Reliability'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{groups.map(group=><Fragment key={group}><tr className="team-venue-row"><th colSpan={groupBy==='Role'?12:11}>{group} · {count(rows.filter(p=>grouping(p)===group).length)}</th></tr>{rows.filter(p=>grouping(p)===group).sort((a,b)=>personName(a).localeCompare(personName(b))).map(p=><tr key={p.id} className="team-person-row"><td data-label="Employee"><Link className="font-medium hover:underline" to={`/hr/employees/${p.id}`}>{personName(p)}</Link><div className="text-xs text-muted-foreground">{p.job_title||'Role not recorded'}</div></td>{groupBy==='Role'&&<td data-label="Works at">{venue(p)}</td>}<td data-label="Type">{p.employment_type?.replace(/_/g,' ')??'—'}</td><td data-label="Started">{p.hire_date?formatDate(p.hire_date):'—'}{findings.some(f=>f.id===`${p.id}-start`)&&<Button variant="link" size="sm" className="text-warning h-auto px-0" onClick={()=>topic(findings.find(f=>f.id===`${p.id}-start`)?.question??'Check start date')}>Check date</Button>}</td>{metricCells(p).map(cell=><td key={cell.label} data-label={cell.label}>{cell.value==null?'—':<Button variant="link" className="h-auto p-0 td-num text-foreground" aria-label={`${personName(p)} ${cell.label} ${cell.value}`} onClick={()=>setPopup({title:`${personName(p)} · ${cell.label}`,lines:cell.lines})}>{cell.label==='Reliability'?`${count(cell.value)} facts`:formatDecimal(cell.value,cell.value%1?1:0)}</Button>}{cell.label==='AL taken'&&findings.some(f=>f.id===`${p.id}-conflict`)&&<Button variant="link" className="h-auto p-0 text-warning text-xs" onClick={()=>topic(findings.find(f=>f.id===`${p.id}-conflict`)?.question??'Check leave conflict')}>Check</Button>}</td>)}</tr>)}</Fragment>)}{!rows.length&&<tr><td colSpan={groupBy==='Role'?12:11}>{data.loading?'Loading people…':'No people in this view.'}</td></tr>}</tbody></table>
    </section><PeopleEvidenceDialog value={popup} today={data.today} onClose={()=>setPopup(null)}/></div>;
}
