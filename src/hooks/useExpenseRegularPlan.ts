import {useQuery} from '@tanstack/react-query';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
export function useExpenseRegularPlan(){const {tenantId}=useActiveTenant(),auth=useAuth(),preview=usePreviewMode();return useQuery({queryKey:['expense-regular-plan',auth.user?.id,tenantId,preview.previewUserId],enabled:!!tenantId,queryFn:async()=>{const names=['expense_accrual_drafts','journal_entries','journal_lines','supplier_accounts','prepaid_schedule_lines','prepaid_schedules','expense_recurring_rules'];const rows=await Promise.all(names.map(n=>fetchAllRows(n,'*',undefined,tenantId,true)));return {drafts:rows[0],entries:rows[1],lines:rows[2],meters:rows[3],prepaid:rows[4],schedules:rows[5],rules:rows[6]};}});}
export function manuallyBooked(data:ReturnType<typeof useExpenseRegularPlan>['data'],account:string|null|undefined,month:string,amount:number){if(!data||!account)return false;return data.entries.some(e=>e.status==='posted'&&e.source_type==='manual'&&e.entry_date.startsWith(month)&&Math.abs(data.lines.filter(l=>l.entry_id===e.id&&l.account_id===account).reduce((n,l)=>n+Number(l.debit)-Number(l.credit),0)-amount)<.01);}
