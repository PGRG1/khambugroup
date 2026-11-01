import {useQuery} from '@tanstack/react-query';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {defaultScheduleSettings,type ScheduleSettings} from '@/utils/financeSchedules';
export function useFinanceSchedules(){const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode();const q=useQuery({queryKey:['finance-schedules',user?.id,tenantId,preview.previewUserId],enabled:!!tenantId,queryFn:async()=>{const names=['finance_schedule_settings','finance_entry_drafts','finance_deferred_items','fixed_assets','fixed_asset_depreciation_schedule','prepaid_schedules','prepaid_schedule_lines','expense_accrual_drafts','deposit_opening_balances','expense_recurring_rules','goods_received_notes','grn_items','stock_count_sessions','stock_count_items'];const rows=await Promise.all(names.map(n=>fetchAllRows(n,'*',undefined,tenantId,true)));return Object.fromEntries(names.map((n,i)=>[n,rows[i]]));}});return {...q,tenantId,settings:{...defaultScheduleSettings,...q.data?.finance_schedule_settings?.[0]} as ScheduleSettings,rows:(name:string)=>q.data?.[name]??[]};}
