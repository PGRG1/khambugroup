import {Choice} from './SettingsForm';
import {usePeopleSettings} from '@/hooks/usePeopleSettings';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {supabase} from '@/integrations/supabase/client';
import {approvalWords} from '@/utils/settingsFacts';
import UserAccessControl from '@/pages/UserAccessControl';
import {toast} from 'sonner';
export function UsersTab({approvalOnly=false}:{approvalOnly?:boolean}){
 const settings=usePeopleSettings();const {tenantId}=useActiveTenant();const mode=settings.company.approvals??'owner_run';
 if(!approvalOnly)return <UserAccessControl/>;
 const save=async(next:string)=>{if(!tenantId||next===mode)return;const {error}=await supabase.rpc('save_people_settings',{t:tenantId,v:null,p:{approvals:next}});if(error)toast.error(error.message);else{window.dispatchEvent(new Event('people-settings-changed'));toast.success('Approvals saved');}};
 return <Choice label="Who approves changes" value={mode as string} onChange={k=>void save(k)} options={Object.entries(approvalWords).map(([key,line])=>({key,title:key==='owner_run'?'Owner-run':key==='managed'?'Managed':'Strict',line:line as string}))}/>;
}
