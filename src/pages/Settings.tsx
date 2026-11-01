import { PageControls } from '@/components/kit/PageTopControls';
import {Link,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {PageTop as PageHeader} from '@/components/kit/PageTop';
import {SectionPillRow} from '@/components/kit/SectionPillRow';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import Notifications from '@/pages/Notifications';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {settingsTabs,settingsTabKey} from '@/utils/settingsFacts';
import AccessDenied from '@/pages/AccessDenied';
export default function Settings(){const [params]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;const tabs=settingsTabs.filter(t=>admin||t==='Master data'&&permissions.canAccessPage('invoices')||t==='Alerts'&&permissions.canAccessPage('notifications'));const key=params.get('tab')??(admin?'business':permissions.canAccessPage('invoices')?'master-data':'alerts');const tab=tabs.find(t=>settingsTabKey(t)===key);if(!tab)return <AccessDenied/>;return <div className="min-w-0 space-y-5 settings-page"><PageHeader title="Settings"/><PageControls><div className="sm:hidden"><SectionPillRow label="Settings tabs" items={tabs.map(t=>({label:t,path:`/settings?tab=${settingsTabKey(t)}`}))} activePath={`/settings?tab=${settingsTabKey(tab)}`}/></div><nav aria-label="Settings tabs" className="hidden sm:flex gap-6 border-b border-border">{tabs.map(t=><Link key={t} to={`/settings?tab=${settingsTabKey(t)}`} aria-current={t===tab?'page':undefined} className={`py-3 text-sm border-b-2 ${t===tab?'border-primary text-foreground':'border-transparent text-muted-foreground'}`}>{t}</Link>)}</nav></PageControls><section className="kit card-glass overflow-hidden min-w-0">{tab==='Business'?<BusinessTab/>:tab==='Users'?<UsersTab/>:tab==='Accounting'?<AccountingTab/>:tab==='Master data'?<MasterDataTab/>:tab==='Bani'?<BaniTab/>:<Notifications/>}</section></div>;}
