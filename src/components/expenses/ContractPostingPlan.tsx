import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Link} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {contractPlan} from '@/utils/expenseAccruals';
import {formatMonthLabel,formatMenuCurrency} from '@/utils/format';
import type {RecurringRule} from '@/hooks/useRecurringExpenses';
import type {ExpenseBill} from '@/hooks/useExpenseBills';
import {toast} from 'sonner';
export function ContractPostingPlan({rule,bills}:{rule:Partial<RecurringRule>;bills:ExpenseBill[]}){
 const {tenantId}=useActiveTenant(),auth=useAuth(),preview=usePreviewMode(),year=new Date().getFullYear();
 const query=useQuery({queryKey:['contract-drafts',auth.user?.id,tenantId,preview.previewUserId,rule.id],enabled:!!tenantId&&!!rule.id,queryFn:async()=>{const {data,error}=await supabase.from('expense_accrual_drafts').select('*').eq('tenant_id',tenantId??'').eq('recurring_rule_id',rule.id??'');if(error)throw error;return data;}});
 if(!rule.is_contract)return null;
 const plan=contractPlan({expected_amount:Number(rule.expected_amount??0),cadence:rule.cadence??'monthly',effective_from:rule.effective_from??null,contract_end:rule.contract_end,rent_free_months:rule.rent_free_months,step_increases:rule.step_increases},`${year}-01-01`,`${year}-12-31`);
 const createDraft=async(month:string,_amount:number)=>{if(!tenantId||!rule.id)return;const {error}=await supabase.rpc('expense_monthend_run',{t:tenantId,m:`${month}-01`});if(error)toast.error(error.message);else{toast.success('Month-end prepared; automatic items booked, others waiting');void query.refetch();}};
 return <section className="card-glass rounded-xl p-3 sm:p-4 min-w-0"><h3 className="font-display font-semibold">{year} postings plan</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left py-2">Month</th><th className="text-right">Monthly share</th><th className="text-right">Booking</th></tr></thead><tbody>{plan.map(p=>{const bs=bills.filter(b=>b.recurring_rule_id===rule.id&&(b.period_start??b.bill_date).startsWith(p.month)),booked=bs.find(b=>b.approval_status==='posted'),draft=query.data?.find(d=>d.month_start.startsWith(p.month));return <tr key={p.month} className="border-t border-border"><td className="py-2">{formatMonthLabel(p.month)}</td><td className="text-right td-num">{formatMenuCurrency(p.amount)}{p.cadence==='quarterly'&&<span className="text-xs text-muted-foreground"> · quarterly</span>}</td><td className="text-right">{booked?<Link className="text-primary" to={`/expenses/bills?bill=${booked.id}`}>Booked</Link>:draft?.status==='posted'?'Booked':bs.length?<Link className="text-warning" to={`/expenses/bills?bill=${bs[0].id}`}>Waiting for you</Link>:draft?<Button variant="link" disabled={!auth.isAdmin||preview.isPreviewActive} onClick={async()=>{const {error}=await supabase.rpc('expense_accrual_approve',{p_id:draft.id});if(error)toast.error(error.message);else{toast.success('Contract month booked');void query.refetch();}}}>Approve month</Button>:<Button variant="ghost" className="text-xs" disabled={!auth.isAdmin||preview.isPreviewActive||p.needsTerm} onClick={()=>createDraft(p.month,p.amount)}>Prepare draft</Button>}</td></tr>;})}</tbody></table></div>{!rule.contract_end&&<p className="text-xs text-muted-foreground mt-3">End date not supplied. Rent-free months and increases need the full contract term.</p>}</section>;
}