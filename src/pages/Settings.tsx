import {useEffect,useState} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {ChevronRight,Search} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useSettingsSummary} from '@/hooks/useSettingsSummary';
import {Button} from '@/components/ui/button';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {Flag} from '@/components/finance/accounting/AccountingKit';
import {movedToAccounting,resolveSettingsDestination,settingsGroups,settingsHref,visibleSettingsDestinations} from '@/utils/settingsNavigation';
import AuditLog from '@/pages/AuditLog';
import AccessDenied from '@/pages/AccessDenied';
import './settings.css';

// Settings: one overview (grouped rows, each with its current value and anything missing in amber),
// and each row opens its own page. Same on phone and computer; no side menu, no dropdown.
const OWN_CARDS=new Set(['venues']);

export default function Settings(){
 const [params]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
 const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;
 const {tenantId,memberships}=useActiveTenant();const [search,setSearch]=useState('');
 useEffect(()=>{document.body.dataset.settings='1';return()=>{delete document.body.dataset.settings;};},[]);
 const destinations=visibleSettingsDestinations(admin,permissions.canAccessPage('invoices'));
 const current=resolveSettingsDestination(params);const active=destinations.find(d=>d.id===current);
 const facts=useSettingsSummary(admin&&current==='overview');
 const moved=current!=='overview'&&current!=='denied'?movedToAccounting[current]:undefined;
 if(moved&&admin)return <Navigate to={moved} replace/>;
 if(!destinations.length||current!=='overview'&&!active)return <AccessDenied/>;
 const business=memberships.find(m=>m.tenant_id===tenantId)?.tenant_name??'Current business';

 if(active){
  const ownHeading=active.id==='venues';
  const content=active.group==='Business'||['purchasing','stock','team'].includes(active.id)?<BusinessTab destination={active.id}/>
   :active.id==='activity'?<AuditLog/>:active.group==='Team & access'?<UsersTab approvalOnly={active.id==='approvals'}/>
   :active.group==='Money'?<AccountingTab destination={active.id}/>
   :active.group==='Lists'?<MasterDataTab destination={active.id as 'suppliers'|'products'|'categories'}/>:<BaniTab/>;
  return <div className="settings-page min-w-0 space-y-4 max-sm:space-y-3 pb-24">
   {!ownHeading&&<header className="px-1">
    <Link to="/settings" className="text-[13px] text-[#2F5E5A]">← Settings</Link>
    <h1 className="mt-1 text-[22px] font-semibold">{active.label}</h1>
    <p className="mt-0.5 text-[13px] text-muted-foreground">{active.description}</p>
   </header>}
   <div key={`${tenantId}:${active.id}`} className={OWN_CARDS.has(active.id)?'min-w-0':'settings-panel card-glass rounded-xl p-4 sm:p-5 min-w-0'}>{content}</div>
  </div>;
 }

 const q=search.trim().toLowerCase();
 const matches=destinations.filter(d=>`${d.label} ${d.group} ${d.description}`.toLowerCase().includes(q));
 const groups=settingsGroups.filter(g=>matches.some(d=>d.group===g));
 const needs=destinations.filter(d=>facts.data?.[d.id]?.amber);
 const half=Math.ceil(groups.length/2);
 const groupCard=(g:string)=><section key={g} className="card-glass rounded-xl px-1 pt-3 pb-1 min-w-0" aria-label={g}>
  <h2 className="px-3 pb-1.5 text-[13px] font-semibold text-[color:var(--kit-ink)]">{g}</h2>
  <ul className="kit">{matches.filter(d=>d.group===g).map(d=>{const f=facts.data?.[d.id];const sub=f?.sub??d.description;return <li key={d.id} className="border-t border-border/60">
   <Link to={settingsHref(d.id)} className={`flex items-center gap-2.5 min-h-[52px] px-3 py-2 ${f?.amber?'bg-[#FDF3F2]':''}`}>
    <span className="w-4 shrink-0">{f?.amber&&<Flag text={sub}/>}</span>
    <span className="block flex-1 min-w-0"><span className="block truncate text-[14px]">{d.label}</span><span className={`block truncate text-[12px] ${f?.amber?'text-[#B45309]':'text-muted-foreground'}`}>{sub}</span></span>
    {f?.value&&<span className="shrink-0 text-[13px] text-muted-foreground whitespace-nowrap">{f.value}</span>}
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/>
   </Link></li>;})}</ul>
 </section>;
 return <div className="settings-page min-w-0 space-y-4 max-sm:space-y-3 pb-24">
  <header className="flex flex-wrap items-end justify-between gap-3 px-1">
   <div><p className="text-[12px] text-muted-foreground">{business}</p><h1 className="text-[22px] font-semibold">Settings</h1></div>
   <label className="flex h-10 w-full sm:w-[360px] items-center gap-2 rounded-full border border-[rgba(31,63,59,.12)] bg-white px-4 text-[14px]"><Search className="h-4 w-4 shrink-0 text-muted-foreground"/><input aria-label="Find a setting" placeholder="Find a setting" className="min-w-0 flex-1 bg-transparent outline-none" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  </header>
  {needs.length>0&&!q&&<div className="rounded-[14px] bg-[#FDF3E8] px-4 py-3 text-[13px] text-[#8A420B]"><b className="font-semibold">Needs you:</b> {needs.map(d=>facts.data?.[d.id]?.sub??d.label).join(' · ')}</div>}
  {groups.length?<div className="grid gap-3 lg:grid-cols-2 lg:gap-4 items-start">
   <div className="space-y-3 lg:space-y-4 min-w-0">{groups.slice(0,half).map(groupCard)}</div>
   <div className="space-y-3 lg:space-y-4 min-w-0">{groups.slice(half).map(groupCard)}</div>
  </div>:<div role="status" className="card-glass rounded-xl p-8 text-center text-sm text-muted-foreground"><p>No settings match “{search}”.</p><Button variant="link" onClick={()=>setSearch('')}>Clear search</Button></div>}
 </div>;
}
