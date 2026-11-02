import {BillScheduleProposal} from './BillScheduleProposal';
import {useFinanceSchedules} from '@/hooks/useFinanceSchedules';
import {useQueryClient} from '@tanstack/react-query';
import type {Invoice,InvoiceLineItem} from '@/hooks/useInvoiceData';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export function InvoiceAssetProposal({invoice,line}:{invoice:Invoice;line:InvoiceLineItem}){
 const q=useFinanceSchedules(),cache=useQueryClient();
 const pending=q.rows('finance_entry_drafts').find(d=>d.source_data?.invoice_asset_line===line.id&&d.status!=='cancelled');
 if(pending)return <p className="text-xs text-muted-foreground">Asset proposal · {pending.status}</p>;
 return <BillScheduleProposal allEligible proposalLabel="Treat as an asset · proposal" header={{bill_date:invoice.invoice_date,approval_status:'draft'}} line={{amount:Number(line.total),notes:line.description,tax_amount:0,line_no:1,expense_category:null,account_id:null,venue:invoice.venue,department:null,tax_treatment:"none"}} canWrite={!!q.tenantId} onAsset={async patch=>{if(!q.tenantId)return;const {error}=await supabase.rpc('finance_invoice_asset_propose',{t:q.tenantId,p:{line:line.id,name:patch.asset_name,category:patch.asset_category,life_months:patch.useful_life_months,date:patch.in_service_date}});if(error){toast.error(error.message);return;}await cache.invalidateQueries({queryKey:['finance-schedules']});toast.success('Asset proposal saved for monthly approval; posted sources stay unchanged');}}/>;
}