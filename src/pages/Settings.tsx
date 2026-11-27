import {useEffect} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useSettingsSummary} from '@/hooks/useSettingsSummary';
import {usePlatformAdmin} from '@/hooks/usePlatformAdmin';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab,ApprovalsCard} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {RevenueMapping} from '@/components/settings/RevenueMapping';
import {PurchasingSetup} from '@/components/settings/PurchasingSetup';
import {ClientSetup} from '@/components/settings/ClientSetup';
import {ClientCategories} from '@/components/settings/ClientCategories';
import '@/components/kit/kit.css';
import ChartOfAccounts from '@/pages/finance/ChartOfAccounts';
import {FinanceTaxView} from '@/components/finance/FinanceTaxView';
import {CurrenciesView} from '@/components/finance/CurrenciesView';
import {FinanceSchedulesView} from '@/components/finance/FinanceSchedulesView';
import {mergedInto,movedToAccounting,resolveSettingsDestination,settingsGroups,settingsHref,visibleSettingsDestinations} from '@/utils/settingsNavigation';
import AuditLog from '@/pages/AuditLog';
import AccessDenied from '@/pages/AccessDenied';
import './settings.css';

// Settings: on computer and tablet its pages sit under Settings in Bani's main menu (one menu; the collapsed rail's
// Settings pop-up lists them too), so this page shows only the open page. On phone: the Settings list, then the page.

export default function Settings(){
 const [params]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
 const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;
 const {tenantId}=useActiveTenant();
 useEffect(()=>{document.body.dataset.settings='1';return()=>{delete document.body.dataset.settings;};},[]);
 const {isPlatformAdmin:bani}=usePlatformAdmin();
 const destinations=visibleSettingsDestinations(admin,permissions.canAccessPage('invoices'),bani);
 const resolved=resolveSettingsDestination(params);const current=resolved!=='overview'&&resolved!=='denied'?mergedInto[resolved]??resolved:resolved;const picked=destinations.find(d=>d.id===current);
 const facts=useSettingsSummary(admin);
 const moved=current!=='overview'&&current!=='denied'?movedToAccounting[current]:undefined;
 if(moved&&admin)return <Navigate to={moved} replace/>;
 if(!destinations.length||current!=='overview'&&!picked)return <AccessDenied/>;
 // Computer and tablet always show a page: the first one when nothing is picked.
 const active=picked??destinations[0];
 const amber=(id:string)=>!!facts.data?.[id as keyof typeof facts.data]?.amber;
 const dot=(id:string)=>amber(id)||Object.entries(mergedInto).some(([child,parent])=>parent===id&&amber(child));
 const groups=settingsGroups.filter(g=>destinations.some(d=>d.group===g));

 // One item per group; its pages are pills at the top of the page (like Purchasing).
 const groupDot=(g:string)=>destinations.some(d=>d.group===g&&dot(d.id));
 const menu=<nav aria-label="Settings" className="settings-menu">
  <ul>{groups.map(g=>{const first=destinations.find(d=>d.group===g)!;const on=g===active.group;return <li key={g}>
   <Link to={settingsHref(first.id)} aria-current={on?'page':undefined} className={`settings-menu-item ${on?'is-on':''}`}>
    <span className="min-w-0 flex-1 truncate">{g}</span>
    {groupDot(g)&&<span className="settings-dot" role="img" aria-label="Something is missing"/>}
    <ChevronRight className="settings-menu-chev h-4 w-4"/>
   </Link></li>;})}</ul>
 </nav>;

 const ownHeading=active.id==='venues'&&params.has('venue');
 const pills=destinations.filter(d=>d.group===active.group);
 const content=active.id==='setup'?<ClientSetup/>
  :active.id==='categories'?<ClientCategories/>
  :active.id==='books'?<><AccountingTab destination="books"/><AccountingTab destination="opening"/></>
  :active.group==='Business'||active.group==='Operations'?<BusinessTab destination={active.id}/>
  :active.id==='activity'?<AuditLog/>:active.id==='approvals'?<ApprovalsCard/>:active.group==='People'?<UsersTab/>
  :active.id==='revenue'?<RevenueMapping/>
  :active.id==='purchasingsetup'?<PurchasingSetup/>
  :active.id==='accounts'?<ChartOfAccounts/>
  :active.id==='tax'?<FinanceTaxView/>
  :active.id==='base'?<CurrenciesView/>
  :active.id==='schedule'?<FinanceSchedulesView/>
  :active.group==='Accounting'?<AccountingTab destination={active.id}/>
  :active.group==='Lists'?<MasterDataTab destination={active.id as 'suppliers'|'products'|'categories'}/>:<BaniTab/>;
 const page=<main className="settings-main min-w-0">
  {!ownHeading&&<header className="settings-head">
   <Link to="/settings" className="settings-back"><ChevronLeft className="h-4 w-4"/>Settings</Link>
   {pills.length>1&&<nav aria-label={active.group} className="settings-pills max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="invoice-switch">{pills.map(d=><Link key={d.id} to={settingsHref(d.id)} replace aria-current={d.id===active.id?'page':undefined} className={`invoice-switch-item ${d.id===active.id?'is-active':''}`}>{d.label}</Link>)}</div></nav>}
   <h2 className="settings-head-title">{pills.length>1?active.label:active.group}</h2>
  </header>}
  <div key={`${tenantId}:${active.id}`} className="settings-body min-w-0">{content}</div>
 </main>;

 return <div className={`settings-page ${picked?'has-page':'has-menu'}`}><h1 className="settings-page-title">Settings</h1><div className="settings-shell">{menu}{page}</div></div>;
}
