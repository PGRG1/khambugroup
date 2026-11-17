import {usePeopleRoles} from '@/hooks/usePeopleRoles';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toolbar } from '@/components/kit/Toolbar';
import { FilterPanel, FilterGroup } from '@/components/kit/FilterPanel';
import { Segmented } from '@/components/kit/QuickFilter';
import { SortMenu } from '@/components/kit/SortMenu';
import { LoadingTable } from '@/components/kit/LoadingSlots';
import { shortDay } from '@/utils/salesRecordChecks';
import { usePeopleData } from '@/hooks/usePeopleData';
import { useVenueScope } from '@/hooks/useVenueScope';
import {RevenuePageTop} from '@/components/revenue/RevenuePageTop';
import { useBaniWorkPublisher } from '@/components/assistant/FloatingBaniContext';
import { peopleFindings, personName } from '@/utils/peopleRecord';
import { workingPerson } from '@/utils/people';
import { formatTableInteger } from '@/utils/format';
import { downloadCSV } from '@/utils/csvDownload';
import {roleGroup} from '@/utils/peoplePresentation';
import {usePeopleGrouping} from '@/hooks/usePeopleGrouping';
import { TeamLeaveCell } from '@/components/hr/TeamLeaveCell';
import { employmentType, restDayMetrics } from '@/utils/peopleAttendance';
import './people.css';

export default function HREmployees() {
  const rolesMap=usePeopleRoles(),data=usePeopleData(),scope=useVenueScope();
  const [groupBy,setGroupBy]=usePeopleGrouping(data.owner,data.loading);
  const [view,setView]=useState<'working'|'left'>('working'),[search,setSearch]=useState(''),[attention,setAttention]=useState(false),navigate=useNavigate();
  const venue=(p:any)=>scope.venues.find(v=>v.id===p.venue_id||v.name===p.venue)?.name??'Venue not recorded';
  const scoped=data.employees.filter(p=>venue(p)==='Venue not recorded'?scope.isAll:scope.includesName(venue(p)));
  const current=scoped.filter(p=>workingPerson(p.status,p.hire_date,data.today,p.end_date));
  const rows=scoped.filter(p=>(view==='working'?workingPerson(p.status,p.hire_date,data.today,p.end_date):!workingPerson(p.status,p.hire_date,data.today,p.end_date))&&`${personName(p)} ${p.job_title??''}`.toLowerCase().includes(search.toLowerCase()));
  const grouping=(p:any)=>groupBy==='Role'?roleGroup(p.job_title,rolesMap):venue(p);
  const findings=peopleFindings(scoped,data);
  const unset=current.filter(p=>roleGroup(p.job_title,rolesMap)==='No role set');
  if(unset.length)findings.push({id:'people-roles',tone:'amber',title:`${unset.length} people need a role`,detail:unset.map(personName).join(' · '),label:'Check',question:`Ask me which role ${unset.map(personName).join(', ')} works in. Do not guess or suggest pay. Draft dated job title changes only for confirmation.`});
  for(const p of current){const rd=restDayMetrics(p,data);if(rd.owed)findings.unshift({id:`${p.id}-rest`,tone:'amber',title:`${personName(p)} · ${rd.owed} rest days owed`,detail:rd.outstanding.map(l=>l.due).join(' · '),label:'Draft',question:`Include ${rd.owed} substitute rest days for ${personName(p)} in the next rota draft, due ${rd.outstanding.map(l=>l.due).join(', ')}. Show exact days and wait for manager confirmation; do not save or change payroll or leave ledger.`});}
  useBaniWorkPublisher('/hr/employees',findings,!data.loading);
  const count=formatTableInteger;
  const reasons=(p:any)=>{const out:string[]=[];if(workingPerson(p.status,p.hire_date,data.today,p.end_date)){if(roleGroup(p.job_title,rolesMap)==='No role set')out.push('Role not set');const rd=restDayMetrics(p,data);if(rd.owed)out.push(`${rd.owed} rest ${rd.owed===1?'day':'days'} owed`);}return out;};
  const shown=rows.filter(p=>!attention||reasons(p).length).sort((a,b)=>grouping(a).localeCompare(grouping(b))||personName(a).localeCompare(personName(b)));
  const needYou=rows.filter(p=>reasons(p).length).length;
  const full=rows.filter(p=>p.employment_type==='full_time').length;
  const download=()=>downloadCSV(shown.map(p=>({employee:personName(p),role:p.job_title,type:employmentType(p.employment_type),venue:venue(p),started:p.hire_date})),[{key:'employee',label:'Employee'},{key:'role',label:'Role'},{key:'type',label:'Type'},{key:'venue',label:'Works at'},{key:'started',label:'Started'}],'team');
  const filter=<FilterPanel activeCount={Number(view!=='working')+Number(attention)} onReset={()=>{setView('working');setAttention(false);}} resultLabel={`Show ${formatTableInteger(shown.length)} people`}>
    <FilterGroup title="Show"><Segmented value={view} onChange={setView} options={[{key:'working',label:'Working'},{key:'left',label:'Left'}]}/></FilterGroup>
    <FilterGroup title="Needs you"><Segmented value={attention?'yes':'all'} onChange={v=>setAttention(v==='yes')} options={[{key:'all',label:'Everyone'},{key:'yes',label:'Needs you'}]}/></FilterGroup>
  </FilterPanel>;
  return <div className="team-page kit w-full min-w-0 space-y-5 max-sm:space-y-3 pb-24">
    <RevenuePageTop tabsAbove title="Team"/>
    <section aria-label="Team list" className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0"><div className="space-y-3">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5" aria-label="Team summary"><span>{data.loading?'…':`${count(rows.length)} ${rows.length===1?'person':'people'}`}</span>{!data.loading&&rows.length>0&&<span className="text-[13px] text-muted-foreground font-normal td-num">· {count(full)} full-time · {count(rows.length-full)} part-time</span>}</h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search people" searchAfterControls mobileSearchBelow filter={filter} sort={<SortMenu value={groupBy} onChange={setGroupBy} options={[{key:'Venue',label:'By venue',compactLabel:'Venue'},{key:'Role',label:'By role',compactLabel:'Role'}]}/>} onDownload={download} downloadLabel="Download Team"/>
      {needYou>0&&!attention&&<p className="kit text-[13px] px-1" style={{color:'var(--kit-ink)'}}><strong>{count(needYou)} {needYou===1?'person needs':'people need'} you</strong> · <button type="button" className="kit-link" onClick={()=>setAttention(true)}>Show them</button></p>}
    </div>
    {data.loading?<LoadingTable mobile headings={['Name','Role','Works at','Type']}/>:!shown.length?<p className="p-10 text-center text-sm text-muted-foreground">{search||attention||view!=='working'?'Nothing matches your search or filters.':'No people yet.'}</p>:
    <div className="kit sales-table-scroll"><table className="sales-table" aria-label="Team"><colgroup><col className="sales-col-flag"/><col className="w-[170px]"/><col className="w-[140px]"/><col className="w-[120px]"/><col className="w-[96px]"/><col className="w-[110px]"/><col className="w-[300px]"/></colgroup>
      <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th>{['Name','Role','Works at','Type','Started','Leave'].map(h=><th key={h} scope="col" className="sales-cell-left">{h}</th>)}</tr></thead>
      <tbody>{shown.map(p=>{const why=reasons(p);const open=()=>navigate(`/hr/employees/${p.id}`);return <tr key={p.id} tabIndex={0} className={`sales-record-row ${why.length?'sales-attention-row':''}`} onClick={open} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open();}}} aria-label={personName(p)}>
        <td className="sales-flag-cell">{why.length>0&&<span className="sales-flag" role="img" aria-label={why.join(' · ')} title={why.join(' · ')}>!</span>}</td>
        <td className="sales-cell-left" title={personName(p)}>{personName(p)}</td>
        <td className={`sales-cell-left ${p.job_title?'':'text-muted-foreground'}`} title={p.job_title||undefined}>{p.job_title||'Not set'}</td>
        <td className="sales-cell-left" title={venue(p)}>{venue(p)}</td>
        <td className="sales-cell-left">{employmentType(p.employment_type)}</td>
        <td className="sales-cell-left td-num">{p.hire_date?shortDay(p.hire_date):'—'}</td>
        <td className="sales-cell-left" onClick={e=>e.stopPropagation()}><TeamLeaveCell person={p} data={data}/></td>
      </tr>;})}</tbody></table></div>}
    </section></div>;
}
