import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {PageTop as PageHeader} from '@/components/kit/PageTop';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {availableSettingsDestinations,resolveSettingsDestination,settingsGroups,settingsHref} from '@/components/settings/settingsNavigation';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {ArrowLeft,ArrowRight,Search} from 'lucide-react';
import AuditLog from '@/pages/AuditLog';
import AccessDenied from '@/pages/AccessDenied';
import './settings.css';

export default function Settings(){
  const [params,setParams]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
  const {tenantId,memberships}=useActiveTenant();const [search,setSearch]=useState('');
  const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;
  // Pop-ups portal outside the page; this marker lets settings.css style them while Settings is open.
  useEffect(()=>{document.body.dataset.settings='1';return()=>{delete document.body.dataset.settings;};},[]);
  const destinations=availableSettingsDestinations(admin,permissions.canAccessPage('invoices'));
  const key=resolveSettingsDestination(params),current=destinations.find(d=>d.key===key);
  const businessName=memberships.find(m=>m.tenant_id===tenantId)?.tenant_name??'Current business';
  if(permissions.loading)return <div className="settings-page p-5 text-muted-foreground" role="status">Loading Settings…</div>;
  if(!destinations.length||key!=='overview'&&!current)return <AccessDenied/>;
  const shown=destinations.filter(d=>`${d.label} ${d.group} ${d.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="min-w-0 space-y-5 settings-page"><PageHeader title="Settings" titleDetail={businessName}/>
    <div className="settings-workspace">
      <aside className="settings-nav hidden lg:block"><nav aria-label="Settings navigation">
        <Button asChild variant="ghost" className="settings-nav-link" aria-current={key==='overview'?'page':undefined}><Link to="/settings">Overview</Link></Button>
        {settingsGroups.filter(group=>destinations.some(d=>d.group===group)).map(group=><div key={group} className="settings-nav-group"><h2>{group}</h2>{destinations.filter(d=>d.group===group).map(d=><Button key={d.key} asChild variant="ghost" className="settings-nav-link" aria-current={key===d.key?'page':undefined}><Link to={settingsHref(d.key)}>{d.label}</Link></Button>)}</div>)}
      </nav></aside>
      <div className="lg:hidden"><Select value={key==='overview'?'overview':key} onValueChange={value=>setParams(value==='overview'?{}:{destination:value})}><SelectTrigger aria-label="Settings section"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="overview">Settings overview</SelectItem>{destinations.map(d=><SelectItem key={d.key} value={d.key}>{d.group} · {d.label}</SelectItem>)}</SelectContent></Select></div>
      <main className="settings-detail min-w-0" aria-label="Settings detail">
        {key==='overview'?<><header className="settings-detail-header"><h2>Make this business yours</h2><p>Manage your business, people and day-to-day defaults.</p></header><div className="relative settings-search"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true"/><Input aria-label="Search settings" placeholder="Search settings" className="pl-9" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          {settingsGroups.filter(group=>shown.some(d=>d.group===group)).map(group=><section className="settings-overview-group" key={group}><h3>{group}</h3><div>{shown.filter(d=>d.group===group).map(d=><Button key={d.key} asChild variant="ghost" className="settings-destination"><Link to={settingsHref(d.key)}><span className="min-w-0"><strong>{d.label}</strong><span>{d.description}</span></span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true"/></Link></Button>)}</div></section>)}{!shown.length&&<p role="status" className="py-8 text-sm text-muted-foreground">No settings match “{search}”.</p>}
        </>:current&&<><nav aria-label="Settings breadcrumb" className="settings-breadcrumb"><Button asChild variant="link" className="p-0 h-auto"><Link to="/settings"><ArrowLeft className="h-3.5 w-3.5"/>Settings</Link></Button><span aria-hidden="true">/</span><span>{current.group}</span></nav><header className="settings-detail-header"><h2>{current.label}</h2><p>{current.description}</p></header>
          {['company','venues','purchasing','stock-reference','team-working','sales-sources'].includes(current.key)?<BusinessTab key={current.key} destination={current.key}/>
          :current.key==='users'||current.key==='approvals'?<UsersTab destination={current.key}/>
          :current.key==='activity'?<AuditLog/>
          :current.group==='Finance'?<AccountingTab key={current.key} destination={current.key}/>
          :current.group==='Master data'?<MasterDataTab destination={current.key}/>
          :<BaniTab/>}
        </>}
      </main>
    </div>
  </div>;
}
