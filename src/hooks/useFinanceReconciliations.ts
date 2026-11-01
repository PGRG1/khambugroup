import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import type {ReconciliationRow} from '@/utils/financeOverview';
export function useFinanceReconciliations(month:string){const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode();return useQuery({queryKey:['finance-reconciliations',user?.id,tenantId,preview.previewUserId,month],enabled:!!tenantId,queryFn:async()=>{if(!tenantId)throw new Error('Choose a business');const [result,explanations,events]=await Promise.all([supabase.rpc('finance_reconciliation_rows',{p_tenant:tenantId,p_month:month+'-01'}),fetchAllRows('finance_reconciliation_explanations','*',undefined,tenantId,true),fetchAllRows('audit_log','*',undefined,tenantId,true)]);if(result.error)throw result.error;return {rows:result.data as unknown as ReconciliationRow[],explanations,events:events.filter(e=>['finance_month_closed','finance_month_reopened'].includes(e.action))};}});}
