import {useEffect} from 'react';
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
import AuditLog from '@/pages/AuditLog';
import AccessDenied from '@/pages/AccessDenied';
import './settings.css';

export default function Settings(){
  const [params]=useSearchParams();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
  const permissions=useUserPermissions(isPreviewActive?previewUserId??undefined:user?.id);const admin=isAdmin&&!isPreviewActive;
  // Pop-ups portal outside the page; this marker lets settings.css style them while Settings is open.
  useEffect(()=>{document.body.dataset.settings='1';return()=>{delete document.body.dataset.settings;};},[]);
  const tabs=settingsTabs.filter(t=>admin||t==='Master data'&&permissions.canAccessPage('invoices'));
  const key=params.get('tab')??(admin?'business':permissions.canAccessPage('invoices')?'master-data':'business');
  const tab=tabs.find(t=>settingsTabKey(t)===key);if(!tab)return <AccessDenied/>;
  const activity=tab==='Users'&&params.get('view')==='activity';
  return <div className="min-w-0 space-y-5 settings-page"><PageHeader title={activity?'Activity':'Settings'}/>
    {tab==='Business'?<section className="kit card-glass overflow-hidden min-w-0"><BusinessTab/></section>
    :tab==='Users'?(activity?<section className="kit card-glass overflow-hidden min-w-0 p-4 sm:p-5"><AuditLog/></section>:<UsersTab/>)
    :tab==='Accounting'?<AccountingTab/>
    :tab==='Master data'?<MasterDataTab/>
    :<section className="kit card-glass overflow-hidden min-w-0"><BaniTab/></section>}
  </div>;
}
