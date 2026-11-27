import {SettingsCard} from './SettingsForm';
import {Switch} from '@/components/ui/switch';
import {usePeopleSettings} from '@/hooks/usePeopleSettings';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {supabase} from '@/integrations/supabase/client';
import UserAccessControl from '@/pages/UserAccessControl';
import {toast} from 'sonner';
// Settings › People: the logins, then one Approvals switch. On = Strict (a second person approves pay changes,
// never the author); off = Owner-run. A client still on Managed keeps it until they switch.
export function UsersTab(){
 const settings=usePeopleSettings();const {tenantId}=useActiveTenant();const {isPreviewActive}=usePreviewMode();const mode=settings.company.approvals??'owner_run';
 const save=async(on:boolean)=>{const next=on?'strict':'owner_run';if(!tenantId||next===mode)return;const {error}=await supabase.rpc('save_people_settings',{t:tenantId,v:null,p:{approvals:next}});if(error)toast.error(error.message);else{window.dispatchEvent(new Event('people-settings-changed'));toast.success('Approvals saved');}};
 return <><UserAccessControl/>
  <SettingsCard title="Approvals"><div className="flex items-center justify-between gap-4 py-1">
   <div className="min-w-0"><p className="text-[13px]">Pay changes need a second approver</p><p className="text-[12px] text-muted-foreground">The person who made the change can't approve it</p></div>
   <Switch checked={mode==='strict'} disabled={isPreviewActive} onCheckedChange={on=>void save(on)} aria-label="Pay changes need a second approver"/>
  </div></SettingsCard></>;
}
