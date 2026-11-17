import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ChevronRight,Search} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {PageTop} from '@/components/kit/PageTop';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {resolveSettingsDestination,settingsHref,visibleSettingsDestinations} from '@/utils/settingsNavigation';
import AuditLog from '@/pages/AuditLog';
import AccessDenied from '@/pages/AccessDenied';
import './settings.css';

export default function Settings(){
 const [params,setParams]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
 const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;
 const {tenantId,memberships}=useActiveTenant();const [search,setSearch]=useState('');
 useEffect(()=>{document.body.dataset.settings='1';return()=>{delete document.body.dataset.settings;};},[]);
 const destinations=visibleSettingsDestinations(admin,permissions.canAccessPage('invoices'));
 const current=resolveSettingsDestination(params);const active=destinations.find(d=>d.id===current);
 if(!destinations.length||current!=='overview'&&!active)return <AccessDenied/>;
 const groups=[...new Set(destinations.map(d=>d.group))];
 const business=memberships.find(m=>m.tenant_id===tenantId)?.tenant_name??'Current business';
 const matches=destinations.filter(d=>`${d.label} ${d.group} ${d.description}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="settings-page min-w-0 space-y-4">
  <PageTop title="Settings" titleDetail={business}/>
  <div className="settings-workspace">
   <aside className="settings-navigation"><nav aria-label="Settings navigation"><Button asChild variant={current==='overview'?'secondary':'ghost'} className="settings-nav-link"><Link to="/settings" aria-current={current==='overview'?'page':undefined}>Settings overview</Link></Button>{groups.map(group=><section key={group}><h2>{group}</h2>{destinations.filter(d=>d.group===group).map(d=><Button asChild key={d.id} variant={current===d.id?'secondary':'ghost'} className="settings-nav-link"><Link to={settingsHref(d.id)} aria-current={current===d.id?'page':undefined}>{d.label}</Link></Button>)}</section>)}</nav></aside>
   <div className="settings-mobile-navigation"><Select value={current} onValueChange={id=>setParams(id==='overview'?{}:new URLSearchParams(destinations.find(d=>d.id===id)?.query))}><SelectTrigger aria-label="Settings section"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="overview">Settings overview</SelectItem>{groups.map(group=><div key={group}><p className="px-2 py-2 text-xs text-muted-foreground">{group}</p>{destinations.filter(d=>d.group===group).map(d=><SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</div>)}</SelectContent></Select></div>
   <main className="settings-detail" aria-label={active?.label??'Settings overview'}>
    {active?<><div className="settings-detail-heading"><Button asChild variant="link" className="h-auto p-0 text-muted-foreground"><Link to="/settings"><ArrowLeft className="h-3.5 w-3.5"/>Settings</Link></Button><p className="text-xs text-muted-foreground mt-5">{active.group}</p><h2 className="text-xl font-semibold mt-1">{active.label}</h2><p className="text-sm text-muted-foreground mt-2">{active.description}</p></div><div key={`${tenantId}:${active.id}`} className="settings-destination">
     {active.group==='Business'||active.group==='Operations'?<BusinessTab destination={active.id}/>
      :active.group==='People & access'?active.id==='activity'?<AuditLog/>:<UsersTab approvalOnly={active.id==='approvals'}/>
      :active.group==='Finance'?<AccountingTab destination={active.id}/>
      :active.group==='Master data'?<MasterDataTab destination={active.id as 'suppliers'|'products'|'categories'}/>:<BaniTab/>}
    </div></>:<><div className="settings-detail-heading"><p className="text-xs text-muted-foreground">{business}</p><h2 className="text-xl font-semibold mt-1">Business settings</h2><p className="text-sm text-muted-foreground mt-2">Manage your business, team and operating preferences.</p><div className="relative mt-5"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="Search settings" className="pl-9" placeholder="Find a setting…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="settings-overview">{groups.filter(group=>matches.some(d=>d.group===group)).map(group=><section key={group}><h3 className="font-semibold text-sm mb-2">{group}</h3>{matches.filter(d=>d.group===group).map(d=><Link key={d.id} to={settingsHref(d.id)} className="settings-destination-link"><div className="min-w-0"><p className="font-medium text-sm">{d.label}</p><p className="text-xs text-muted-foreground mt-1">{d.description}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/></Link>)}</section>)}{!matches.length&&<div role="status" className="settings-empty"><p>No settings match “{search}”.</p><Button variant="link" onClick={()=>setSearch('')}>Clear search</Button></div>}</div></>}
   </main>
  </div>
 </div>;
}
