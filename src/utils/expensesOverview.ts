import {regularBillGroups} from '@/utils/expenses';
import type {ExpenseBill} from '@/hooks/useExpenseBills';
import {formatCurrency,formatMonthLabel} from '@/utils/format';
import type {PageWorkItem} from '@/utils/baniPageWork';
export type ExpenseRow=Record<string,any>;
export function expenseMonths(first:string,last:string){const keys:string[]=[];for(let k=first.slice(0,7);k<=last.slice(0,7)&&keys.length<240;){keys.push(k);const d=new Date(`${k}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);k=d.toISOString().slice(0,7);}return keys;}
export function isRunningAccount(a:ExpenseRow){return ['opex','other_expense'].includes(a.account_type)&&!['6000','6010','6020'].includes(a.code)&&!/salar|wages|payroll|\bmpf\b|cost of sales|stock|depreciation|asset disposal/i.test(a.name);}
export function isQuotation(b:ExpenseRow){return /\bquotation\b|\bquote\b|報價/i.test([b.notes,b.bill_number,b.meta?.document_type,b.meta?.type].filter(Boolean).join(' '));}
export function expenseType(a:ExpenseRow){return /\brent\b|rental/i.test(a.name)?'Rent':/utilit|electric|gas|phone|\bhkt\b|water/i.test(a.name)?'Utilities':'Everything else';}
export type RegularCell={amount:number;manual:boolean;status:'posted'|'waiting'|'missing'|'inactive';bills:string[]};
export function buildExpensesOverview({bills,allocations,entries,lines,accounts,sales,from,to,today,includesId,includesName}:{bills:ExpenseBill[];allocations:ExpenseRow[];entries:ExpenseRow[];lines:ExpenseRow[];accounts:ExpenseRow[];sales:ExpenseRow[];from:string;to:string;today:string;includesId:(id:string|null)=>boolean;includesName:(name:string|null)=>boolean}){
 const accountMap=new Map(accounts.filter(isRunningAccount).map(a=>[a.id,a]));
 const quotes=bills.filter(isQuotation),quoteIds=new Set(quotes.map(b=>b.id)),quoteEntries=new Set(quotes.map(b=>b.journal_entry_id).filter(Boolean));
 const posted=new Map(entries.filter(e=>e.status==='posted'&&!quoteEntries.has(e.id)&&!(e.source_type==='expense_bill'&&quoteIds.has(e.source_id))).map(e=>[e.id,e]));
 const costs:ExpenseRow[]=lines.flatMap(l=>{const e=posted.get(l.entry_id),a=accountMap.get(l.account_id);if(!e||!a)return [];const venue=l.venue??e.venue;if(!includesName(venue))return [];return [{...l,entry:e,account:a,date:e.entry_date,month:e.entry_date.slice(0,7),amount:Number(l.debit)-Number(l.credit),venue}];});
 const inScope=(b:ExpenseBill)=>b.venue_id?includesId(b.venue_id):includesName(b.venue);
 const eligible=bills.filter(b=>!isQuotation(b)&&inScope(b));
 const billMap=new Map(eligible.map(b=>[b.id,b]));
 const billLinked=(c:ExpenseRow,b:ExpenseBill)=>c.entry.id===b.journal_entry_id||c.entry.source_id===b.id;
 const attached=new Set(bills.flatMap(b=>b.journal_entry_id?[b.journal_entry_id]:[]));
 const manual=costs.filter(c=>c.entry.source_type==='manual'&&!attached.has(c.entry.id));
 const groups=regularBillGroups(eligible).filter(g=>g.rows.some(b=>allocations.some(l=>l.bill_id===b.id&&accountMap.has(l.account_id))||costs.some(c=>billLinked(c,b))));
 const keys=expenseMonths(from,to),prior=new Date(`${today.slice(0,7)}-01T00:00:00Z`);prior.setUTCMonth(prior.getUTCMonth()-1);const lastMonth=prior.toISOString().slice(0,7);
 const findings:PageWorkItem[]=[];
 const regular=groups.map(g=>{
  const first=g.rows[0],start=first.bill_date.slice(0,7),last=g.rows[g.rows.length-1].bill_date.slice(0,7),accountIds=new Set(allocations.filter(l=>g.rows.some(b=>b.id===l.bill_id)&&accountMap.has(l.account_id)).map(l=>l.account_id));
  const name=first.vendor_name??'Supplier',label=`${name} · ${first.venue??'Group'}`;
  const cells:Record<string,RegularCell>={},waiting:ExpenseBill[]=[],missing:string[]=[],covered:string[]=[];
  for(const key of keys){const bs=g.rows.filter(b=>b.bill_date.startsWith(key)),linked=costs.filter(c=>c.month===key&&g.rows.some(b=>billLinked(c,b)));
   // Manual evidence must match account, month and exact amount; a null venue remains explicitly group-wide evidence.
   const matched=manual.filter(c=>c.month===key&&accountIds.has(c.account_id)&&(!first.venue||!c.venue||c.venue===first.venue)&&bs.some(b=>Math.abs(c.amount-Number(b.total_amount))<.01));
   const booked=[...new Map([...linked,...matched].map(c=>[c.id,c])).values()],amount=booked.reduce((n,c)=>n+c.amount,0);
   const wait=bs.filter(b=>['draft','pending_review'].includes(b.approval_status));
   const status:RegularCell['status']=amount>0?'posted':wait.length?'waiting':key>=start&&key<=lastMonth?'missing':'inactive';
   cells[key]={amount,manual:matched.length>0,status,bills:bs.map(b=>b.id)};
   if(key>=from.slice(0,7)&&key<=to.slice(0,7)){if(status==='waiting')waiting.push(...wait);if(status==='missing'&&key>last)missing.push(key);if(matched.length&&wait.length)covered.push(key);}
  }
  if(waiting.length){const amount=waiting.reduce((n,b)=>n+Number(b.total_amount),0);findings.push({id:`waiting-${g.key}`,tone:'amber',title:`${name}: ${waiting.length} regular bills waiting · ${formatCurrency(amount)} — those months look lower by this amount`,detail:waiting.map(b=>formatMonthLabel(b.bill_date.slice(0,7))).join(', '),label:`Review ${waiting.length} bills`,href:`/expenses/bills?bills=${waiting.map(b=>b.id).join(',')}`});}
  if(covered.length)findings.push({id:`manual-covered-${g.key}`,tone:'sage',title:`${name}: ${covered.map(k=>formatMonthLabel(k)).join(', ')} is already booked by hand; waiting bill left out`,detail:'Same expense account and amount; approval should be reviewed against the manual journal.',label:'Review',href:`/expenses/bills?bills=${g.rows.filter(b=>covered.includes(b.bill_date.slice(0,7))).map(b=>b.id).join(',')}`});
  if(missing.length)findings.push({id:`missing-${g.key}`,tone:'amber',title:`${label}: no regular bill since ${formatMonthLabel(last)} · ${missing.length} missing months`,detail:missing.map(formatMonthLabel).join(', '),label:'Show',href:'/expenses/recurring'});
  return {key:g.key,label,start,accountIds,cells,kind:'regular' as const};
 });
 const manualRows=[...new Set(manual.map(c=>c.account_id))].map(id=>{
  const a=accountMap.get(id),cells:Record<string,RegularCell>={};for(const key of keys){const cs=manual.filter(c=>c.account_id===id&&c.month===key),amount=cs.reduce((n,c)=>n+c.amount,0);cells[key]={amount,manual:cs.length>0,status:cs.length?'posted':'inactive',bills:[]};}
  return {key:`manual-${id}`,label:`${a?.name??'Expense account'} · manual`,cells,kind:'manual' as const};
 });
 const manualInPeriod=manual.filter(c=>c.date>=from&&c.date<=to);
 if(manualInPeriod.length)findings.push({id:'manual-expenses',tone:'amber',title:`${manualInPeriod.length} manual expense lines have no bill attached`,detail:manualInPeriod.map(c=>`${c.account.name} ${formatCurrency(c.amount)} (${formatMonthLabel(c.month)})`).join(' · '),label:'Show',href:'/finance/books?tab=journal'});
 const doubles=manualInPeriod.filter(c=>costs.some(other=>other.month===c.month&&other.account_id===c.account_id&&other.entry.id!==c.entry.id&&eligible.some(b=>billLinked(other,b))&&(!c.venue||!other.venue||c.venue===other.venue)));
 if(doubles.length)findings.push({id:'possible-double-costs',tone:'amber',title:`Possible double count: ${doubles.map(c=>`${c.account.name} · ${formatMonthLabel(c.month)} · manual ${formatCurrency(c.amount)}`).join('; ')}`,detail:'A posted bill and manual journal hit the same account in the same month.',label:'Review',href:'/finance/books?tab=journal'});
 const scopedQuotes=quotes.filter(b=>inScope(b)&&b.bill_date>=from&&b.bill_date<=to);if(scopedQuotes.length)findings.push({id:'quotations-excluded',tone:'sage',title:`Quotation kept out: ${scopedQuotes.map(b=>`${b.vendor_name} ${formatCurrency(b.total_amount)}`).join(', ')}`,detail:'Not a bill; excluded from costs and regular bill checks.',label:'Show',href:`/expenses/bills?bills=${scopedQuotes.map(b=>b.id).join(',')}`});
 const months=keys.map(key=>{const active=regular.filter(r=>key>=r.start),missing=active.filter(r=>r.cells[key]?.status!=='posted'),complete=key<=lastMonth&&missing.length===0;
  const cs=costs.filter(c=>c.month===key&&c.date>=from&&c.date<=to),amount=cs.reduce((n,c)=>n+c.amount,0),revenue=sales.filter(s=>s.date.startsWith(key)&&s.date>=from&&s.date<=to&&includesName(s.venue)).reduce((n,s)=>n+Number(s.totalSales??s.total_sales??0),0);
  const noRent=missing.some(r=>[...r.accountIds].some(id=>expenseType(accountMap.get(id)??{})==='Rent'));
  return {key,label:formatMonthLabel(key).split(' ')[0],complete,amount:complete?amount:null,recorded:amount,sales:revenue,percent:complete&&revenue>0?amount/revenue*100:null,reason:key>lastMonth?'incomplete':noRent?'no rent':'incomplete',missing:missing.map(r=>r.label)};
 });
 const completeKeys=new Set(months.filter(m=>m.complete).map(m=>m.key)),completeCosts=costs.filter(c=>completeKeys.has(c.month)&&c.date>=from&&c.date<=to),amount=completeCosts.reduce((n,c)=>n+c.amount,0),revenue=months.filter(m=>m.complete).reduce((n,m)=>n+m.sales,0);
 const categories=['Rent','Utilities','Everything else'].map(name=>({name,amount:completeCosts.filter(c=>expenseType(c.account)===name).reduce((n,c)=>n+c.amount,0)}));
 const periodCosts=costs.filter(c=>c.date>=from&&c.date<=to),types=[...new Set(periodCosts.map(c=>c.account.name))].map(name=>({name,amount:periodCosts.filter(c=>c.account.name===name).reduce((n,c)=>n+c.amount,0)})).filter(r=>r.amount!==0).sort((a,b)=>b.amount-a.amount);
 return {months,regular:[...regular,...manualRows],findings,amount,sales:revenue,percent:revenue>0?amount/revenue*100:null,categories,types,periodSales:months.reduce((n,m)=>n+m.sales,0),completeKeys:[...completeKeys]};
}
