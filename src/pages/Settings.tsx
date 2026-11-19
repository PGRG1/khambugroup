import {useEffect} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useSettingsSummary} from '@/hooks/useSettingsSummary';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {movedToAccounting,resolveSettingsDestination,settingsGroups,settingsHref,visibleSettingsDestinations} from '@/utils/settingsNavigation';
import AuditLog from '@/pages/AuditLog';
import AccessDenied from '@/pages/AccessDenied';
import './settings.css';

// Settings, Rillet-style: a plain text menu (group headings, an orange dot where something is missing)
// and one plain page per setting. Computer and tablet show both side by side; phone shows the menu,
// then the page with ‹ Settings. No cards, chips or summary numbers.
export default function Settings(){
 const [params]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
 const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;
 const {tenantId}=useActiveTenant();
 useEffect(()=>{document.body.dataset.settings='1';return()=>{delete document.body.dataset.settings;};},[]);
 const destinations=visibleSettingsDestinations(admin,permissions.canAccessPage('invoices'));
 const current=resolveSettingsDestination(params);const picked=destinations.find(d=>d.id===current);
 const facts=useSettingsSummary(admin);
 const moved=current!=='overview'&&current!=='denied'?movedToAccounting[current]:undefined;
 if(moved&&admin)return <Navigate to={moved} replace/>;
 if(!destinations.length||current!=='overview'&&!picked)return <AccessDenied/>;
 // Computer and tablet always show a page: the first one when nothing is picked.
 const active=picked??destinations[0];
 const dot=(id:string)=>!!facts.data?.[id as keyof typeof facts.data]?.amber;
 const groups=settingsGroups.filter(g=>destinations.some(d=>d.group===g));

 const menu=<nav aria-label="Settings" className="settings-menu">
  <p className="settings-menu-title">Settings</p>
  {groups.map(g=><div key={g}>
   <p className="settings-menu-group">{g}</p>
   <ul>{destinations.filter(d=>d.group===g).map(d=>{const on=d.id===active.id;return <li key={d.id}>
    <Link to={settingsHref(d.id)} aria-current={on?'page':undefined} className={`settings-menu-item ${on?'is-on':''}`}>
     <span className="min-w-0 flex-1 truncate">{d.label}</span>
     {dot(d.id)&&<span className="settings-dot" role="img" aria-label="Something is missing"/>}
     <ChevronRight className="settings-menu-chev h-4 w-4"/>
    </Link></li>;})}</ul>
  </div>)}
 </nav>;

 const ownHeading=active.id==='venues'&&params.has('venue');
 const content=active.group==='Organization'||['purchasing','stock','team'].includes(active.id)?<BusinessTab destination={active.id}/>
  :active.id==='activity'?<AuditLog/>:active.group==='Team'?<UsersTab approvalOnly={active.id==='approvals'}/>
  :active.group==='Accounting'?<AccountingTab destination={active.id}/>
  :active.group==='Lists'?<MasterDataTab destination={active.id as 'suppliers'|'products'|'categories'}/>:<BaniTab/>;
 const page=<main className="settings-main min-w-0">
  {!ownHeading&&<header className="settings-head">
   <Link to="/settings" className="settings-back"><ChevronLeft className="h-4 w-4"/>Settings</Link>
   <p className="settings-head-group">{active.group}</p>
   <h1 className="settings-head-title">{active.label}</h1>
   <p className="settings-head-line">{active.description}</p>
  </header>}
  <div key={`${tenantId}:${active.id}`} className="settings-body min-w-0">{content}</div>
 </main>;

 return <div className={`settings-shell ${picked?'has-page':'has-menu'}`}>{menu}{page}</div>;
}
