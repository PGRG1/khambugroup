import {useSearchParams} from 'react-router-dom';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useUserPermissions} from '@/hooks/useUserPermissions';
import {PageTop as PageHeader} from '@/components/kit/PageTop';
import {BusinessTab} from '@/components/settings/BusinessTab';
import {UsersTab} from '@/components/settings/UsersTab';
import {AccountingTab} from '@/components/settings/AccountingTab';
import {BaniTab} from '@/components/settings/BaniTab';
import {MasterDataTab} from '@/components/settings/MasterDataTab';
import {settingsTabs,settingsTabKey} from '@/utils/settingsFacts';
import AccessDenied from '@/pages/AccessDenied';
export default function Settings(){const [params]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;const tabs=settingsTabs.filter(t=>admin||t==='Suppliers'&&permissions.canAccessPage('invoices'));const key=params.get('tab')??(admin?'business':permissions.canAccessPage('invoices')?'master-data':'business');const tab=tabs.find(t=>settingsTabKey(t)===key);if(!tab)return <AccessDenied/>;return <div className="min-w-0 space-y-5 settings-page"><PageHeader title="Settings"/><section className="kit card-glass overflow-hidden min-w-0">{tab==='Business'?<BusinessTab/>:tab==='Users'?<UsersTab/>:tab==='Accounting'?<AccountingTab/>:tab==='Suppliers'?<MasterDataTab/>:tab==='Bani'?<BaniTab/>:<BaniTab/>}</section></div>;}
