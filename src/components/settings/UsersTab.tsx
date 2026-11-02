import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {usePeopleSettings} from '@/hooks/usePeopleSettings';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {approvalWords} from '@/utils/settingsFacts';
import UserAccessControl from '@/pages/UserAccessControl';
import AuditLog from '@/pages/AuditLog';
import {toast} from 'sonner';
export function UsersTab(){const [params]=useSearchParams();const settings=usePeopleSettings();const {tenantId}=useActiveTenant();const mode=settings.company.approvals??'owner_run';const [open,setOpen]=useState(false),[draft,setDraft]=useState(mode);const activity=params.get('view')==='activity';return <div className="p-4 sm:p-5 space-y-4"><div className="flex flex-wrap items-center gap-2 text-sm"><span>Approvals · {approvalWords[mode]}</span><Button variant="link" className="p-0 h-auto" onClick={()=>{setDraft(mode);setOpen(true);}}>Change</Button></div>{activity?<AuditLog/>:<UserAccessControl/>}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Approvals</DialogTitle></DialogHeader><Select value={draft} onValueChange={setDraft}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(approvalWords).map(([key,label])=><SelectItem key={key} value={key}>{key==='owner_run'?'Owner-run':key==='managed'?'Managed':'Strict'} · {label}</SelectItem>)}</SelectContent></Select><p className="text-sm text-muted-foreground">{approvalWords[draft]}</p><Button onClick={async()=>{if(!tenantId)return;const {error}=await supabase.rpc('save_people_settings',{t:tenantId,v:null,p:{approvals:draft}});if(error)toast.error(error.message);else{window.dispatchEvent(new Event('people-settings-changed'));setOpen(false);toast.success('Approvals saved');}}}>Confirm</Button></DialogContent></Dialog></div>;}
