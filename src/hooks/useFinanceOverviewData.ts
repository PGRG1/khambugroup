import {useQuery} from '@tanstack/react-query';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import type {FinanceBank,FinanceBatch} from '@/utils/financeOverview';
export function useFinanceOverviewData(){const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode();return useQuery({queryKey:['finance-overview-facts',user?.id,tenantId,preview.previewUserId],enabled:!!tenantId,queryFn:async()=>{if(!tenantId)throw new Error('Choose a business');const names=['bank_transactions','payment_settlement_batches','hr_payroll','expense_correction_proposals','payment_processors','bank_statement_imports'];const rows=await Promise.all(names.map(n=>fetchAllRows(n,'*',{col:'id',asc:true},tenantId,true)));return {bank:rows[0] as FinanceBank[],batches:rows[1] as FinanceBatch[],payroll:rows[2],corrections:rows[3],processors:rows[4],statements:rows[5]};}});}
