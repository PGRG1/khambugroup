import {useQuery} from '@tanstack/react-query';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import type {TaxNotice} from '@/utils/taxNotices';
export function useTaxNotices(){const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode();const q=useQuery({queryKey:['tax-notices',user?.id,tenantId,preview.previewUserId],enabled:!!tenantId,queryFn:async()=>{if(!tenantId)return [];return await fetchAllRows('finance_tax_notices','*',{col:'due_date',asc:true},tenantId,true) as TaxNotice[];}});return {...q,tenantId};}