import {usePeopleRoles} from '@/hooks/usePeopleRoles';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download } from 'lucide-react';
import { usePeopleData } from '@/hooks/usePeopleData';
import { useVenueScope } from '@/hooks/useVenueScope';
import {RevenuePageTop} from '@/components/revenue/RevenuePageTop';
import { useBaniWorkPublisher } from '@/components/assistant/FloatingBaniContext';
import { peopleFindings, personName } from '@/utils/peopleRecord';
import { workingPerson } from '@/utils/people';
import { formatDate, formatTableInteger } from '@/utils/format';
import { downloadCSV } from '@/utils/csvDownload';
import {roleGroup} from '@/utils/peoplePresentation';
import {usePeopleGrouping} from '@/hooks/usePeopleGrouping';
import {PeopleGroupSwitch} from '@/components/hr/PeopleGroupSwitch';
import { TeamLeaveCell } from '@/components/hr/TeamLeaveCell';
import { employmentType, restDayMetrics } from '@/utils/peopleAttendance';
import './people.css';

export default function HREmployees() {
  const rolesMap=usePeopleRoles(),data=usePeopleData(),scope=useVenueScope();
  const [groupBy,setGroupBy]=usePeopleGrouping(data.owner,data.loading);
  const [view,setView]=useState('working'),[search,setSearch]=useState('');
  const venue=(p:any)=>scope.venues.find(v=>v.id===p.venue_id||v.name===p.venue)?.name??'Venue not recorded';
  const scoped=data.employees.filter(p=>venue(p)==='Venue not recorded'?scope.isAll:scope.includesName(venue(p)));
  const current=scoped.filter(p=>workingPerson(p.status,p.hire_date,data.today,p.end_date));
  const rows=scoped.filter(p=>(view==='working'?workingPerson(p.status,p.hire_date,data.today,p.end_date):!workingPerson(p.status,p.hire_date,data.today,p.end_date))&&`${personName(p)} ${p.job_title??''}`.toLowerCase().includes(search.toLowerCase()));
  const grouping=(p:any)=>groupBy==='Role'?roleGroup(p.job_title,rolesMap):venue(p);
  const groups=[...new Set(rows.map(grouping))].sort(),findings=peopleFindings(scoped,data);
  const unset=current.filter(p=>roleGroup(p.job_title,rolesMap)==='No role set');
  if(unset.length)findings.push({id:'people-roles',tone:'amber',title:`${unset.length} people need a role`,detail:unset.map(personName).join(' · '),label:'Check',question:`Ask me which role ${unset.map(personName).join(', ')} works in. Do not guess or suggest pay. Draft dated job title changes only for confirmation.`});
  for(const p of current){const rd=restDayMetrics(p,data);if(rd.owed)findings.unshift({id:`${p.id}-rest`,tone:'amber',title:`${personName(p)} · ${rd.owed} rest days owed`,detail:rd.outstanding.map(l=>l.due).join(' · '),label:'Draft',question:`Include ${rd.owed} substitute rest days for ${personName(p)} in the next rota draft, due ${rd.outstanding.map(l=>l.due).join(', ')}. Show exact days and wait for manager confirmation; do not save or change payroll or leave ledger.`});}
  useBaniWorkPublisher('/hr/employees',findings,!data.loading);
  const count=formatTableInteger;
  const summary=`${count(current.length)} working · ${[...new Set(current.map(venue))].sort().map(v=>`${v} ${count(current.filter(p=>venue(p)===v).length)}`).join(' · ')}`;
  return <div className="people-page team-light kit space-y-4"><RevenuePageTop title="Team" titleDetail={<p className="text-sm text-muted-foreground" aria-label="Team summary">{data.loading?'…':summary}</p>} controls={<><PeopleGroupSwitch value={groupBy} onChange={setGroupBy}/><div className="kit-seg">{['working','left'].map(v=><Button key={v} variant="ghost" aria-pressed={view===v} onClick={()=>setView(v)}>{v==='working'?'Working':'Left'}</Button>)}</div><Input aria-label="Search people" placeholder="Search people" className="w-60 max-w-full" value={search} onChange={e=>setSearch(e.target.value)}/></>} actions={<Button variant="outline" size="icon" aria-label="Download Team" onClick={()=>downloadCSV(rows.map(p=>({employee:personName(p),role:p.job_title,type:employmentType(p.employment_type),venue:venue(p),started:p.hire_date})),[{key:'employee',label:'Employee'},{key:'role',label:'Role'},{key:'type',label:'Type'},{key:'venue',label:'Works at'},{key:'started',label:'Started'}],'team')}><Download className="h-4 w-4"/></Button>}/>
    <section aria-label="Team list"><table className="team-evidence-table"><thead><tr>{['Employee','Works at','Type','Started','Leave'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{groups.map(group=><Fragment key={group}><tr className="team-venue-row"><th colSpan={5}>{group} · {count(rows.filter(p=>grouping(p)===group).length)}</th></tr>{rows.filter(p=>grouping(p)===group).sort((a,b)=>personName(a).localeCompare(personName(b))).map(p=><tr key={p.id} className="team-person-row"><td data-label="Employee"><Link className="font-medium hover:underline" to={`/hr/employees/${p.id}`}>{personName(p)}</Link><div className="text-xs text-muted-foreground">{p.job_title||'Role not recorded'}</div></td><td data-label="Works at">{venue(p)}</td><td data-label="Type">{employmentType(p.employment_type)}</td><td data-label="Started">{p.hire_date?formatDate(p.hire_date):'—'}</td><td data-label="Leave"><TeamLeaveCell person={p} data={data}/></td></tr>)}</Fragment>)}{!rows.length&&<tr><td colSpan={5}>{data.loading?'Loading people…':'No people in this view.'}</td></tr>}</tbody></table></section></div>;
}
