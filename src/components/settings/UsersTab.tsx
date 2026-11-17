import {useState} from 'react';
import {usePeopleSettings} from '@/hooks/usePeopleSettings';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {approvalWords} from '@/utils/settingsFacts';
import UserAccessControl from '@/pages/UserAccessControl';
import {toast} from 'sonner';
export function UsersTab({approvalOnly=false}:{approvalOnly?:boolean}){
 const settings=usePeopleSettings();const {tenantId}=useActiveTenant();const mode=settings.company.approvals??'owner_run';const [open,setOpen]=useState(false),[draft,setDraft]=useState(mode);
 if(!approvalOnly)return <UserAccessControl/>;
 return <div className="space-y-5"><div className="settings-detail-row"><div><h3 className="font-medium">{mode==='owner_run'?'Owner-run':mode==='managed'?'Managed':'Strict'}</h3><p className="text-sm text-muted-foreground mt-1">{approvalWords[mode]}</p></div><Button variant="outline" onClick={()=>{setDraft(mode);setOpen(true);}}>Change</Button></div>{open&&<section className="settings-editor space-y-4"><Select value={draft} onValueChange={setDraft}><SelectTrigger aria-label="Approval policy"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(approvalWords).map(([key,label])=><SelectItem key={key} value={key}>{key==='owner_run'?'Owner-run':key==='managed'?'Managed':'Strict'} · {label}</SelectItem>)}</SelectContent></Select><p className="text-sm text-muted-foreground">{approvalWords[draft]}</p><div className="flex gap-2"><Button onClick={async()=>{if(!tenantId)return;const {error}=await supabase.rpc('save_people_settings',{t:tenantId,v:null,p:{approvals:draft}});if(error)toast.error(error.message);else{window.dispatchEvent(new Event('people-settings-changed'));setOpen(false);toast.success('Approvals saved');}}}>Confirm</Button><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button></div></section>}</div>;
}
