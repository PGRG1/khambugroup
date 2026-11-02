import {addDays,type Candidate,type Row} from './rules.ts';

export function feedState(r:Row,now=Date.now()) {
 if(!r.last_success_at&&!r.failure_started_at)return 'never connected';
 if(!r.failure_started_at)return 'connected';
 if(!r.customer_fixable)return 'bani unavailable';
 return now-Date.parse(r.failure_started_at)>=6*3600000||Number(r.consecutive_failures)>=2?'broken':'retrying';
}
export function feedMessage(r:Row,recovered=false) {
 const cutoff=r.complete_up_to??r.last_success_at?.slice(0,10);
 return recovered?`${r.name} is back. Data caught up to ${cutoff??'the latest recorded date'}.`:`${r.name} stopped${cutoff?' on '+cutoff:''}. ${r.error_consequence||'New data is missing. Reconnect to fix.'}`;
}
export function previousWorkingDay(d:string,holidays:string[]=[]) {let day=addDays(d,-1);while([0,6].includes(new Date(day+'T00:00:00Z').getUTCDay())||holidays.includes(day))day=addDays(day,-1);return day;}
export function dueWithinTwoDays(items:Candidate[],today:string) {return items.some(a=>typeof a.payload.deadline==='string'&&a.payload.deadline>=today&&a.payload.deadline<=addDays(today,2));}
export function deadlineSignals(data:Record<string,Row[]>,day:string):Candidate[] {
 const out:Candidate[]=[];
 const emit=(kind:string,id:string,title:string,date:unknown,area:string,path:string,v:string|null=null)=>{if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<day)return;out.push({kind,subject:id,venue_id:v,title,why:`Due ${date}; check the recorded obligation. Bani has not confirmed payment.`,area,action_path:path,date:day,severity:'normal',baseline:null,actual:null,payload:{channel:'work',confidence:'sure',deadline:date}});};
 for(const b of data.expense_bills??[])if(!['voided','reversed'].includes(b.approval_status)&&Number(b.total_amount)>Number(b.paid_amount??0)&&Number(b.meta?.late_fee??b.meta?.late_fees??0)>0)emit('bill_deadline',b.id,`${b.vendor_name}: bill due with a recorded late fee`,b.due_date,'expenses','/expenses/bills',b.venue_id??null);
 for(const n of data.finance_tax_notices??[])if(Number(n.amount)>0)emit('tax_deadline',n.id,`${n.reference}: tax payment due`,n.due_date,'finance','/finance/payables');
 // Only explicitly configured dates, never the legacy estimated 7th/10th conventions.
 for(const p of data.hr_payroll??[]){const dates=p.preparation?.deadlines;if(!dates)continue;if(!p.accrual_journal_entry_id)emit('payroll_deadline',`${p.year}-${p.month}`,`Payroll is due and isn't confirmed`,dates.pay_date,'hr','/hr/payroll');if(Number(p.mpf_employee??0)+Number(p.mpf_employer??0)>Number(p.mpf_paid_amount??0))emit('mpf_deadline',`${p.year}-${p.month}`,`MPF contribution is due`,dates.mpf_due_date,'hr','/hr/payroll');}
 return [...new Map(out.map(a=>[a.kind+'|'+a.subject,a])).values()];
}
export function groupedPending(items:Candidate[]) {
 const labels:Record<string,string>={sales:'Revenue',hr:'People',procurement:'Purchasing',expenses:'Expenses',bank:'Finance',payments:'Finance',finance:'Finance'};
 const groups=new Map<string,Candidate[]>();for(const a of items){const section=labels[a.area]??a.area;groups.set(section,[...(groups.get(section)??[]),a]);}
 return items.length?[`${items.length} items pending.`,...[...groups].map(([section,rows])=>`${section} · ${rows.length}\n\n${rows.map(a=>'- '+a.title+(a.payload.deadline?' — due '+a.payload.deadline:'')).join('\n')}`)].join('\n\n'):'There is nothing pending in your scope.';
}
export function personRoute(a:Candidate,mutes:Row[],userId:string,day:string) {
 const routes=mutes.filter(m=>m.active!==false&&m.target_user_id&&(!m.kind||m.kind===a.kind)&&(!m.area||m.area===a.area)&&(!m.venue_id||m.venue_id===a.venue_id)&&(!m.until_date||m.until_date>=day));
 const last=routes.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];return last?last.target_user_id===userId:null;
}
export function overtimeSignals(data:Record<string,Row[]>,day:string):Candidate[] {
 const out:Candidate[]=[];for(const a of data.hr_attendance??[]){if(a.date<addDays(day,-6)||a.date>day||a.hours_worked==null)continue;const shifts=(data.hr_shifts??[]).filter(s=>s.employee_id===a.employee_id&&s.shift_date===a.date&&s.status!=='cancelled'&&s.start_time&&s.end_time);if(!shifts.length)continue;const planned=shifts.reduce((n,s)=>{const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));let duration=minutes(s.end_time)-minutes(s.start_time);if(duration<0)duration+=1440;return n+Math.max(0,(duration-Number(s.break_minutes??0))/60);},0);if(Number(a.hours_worked)<=planned)continue;const e=(data.hr_employees??[]).find(e=>e.id===a.employee_id);out.push({kind:'overtime_rota',subject:a.id,venue_id:a.venue_id??null,area:'hr',title:`${e?.first_name??'Team member'}: hours exceed rota`,why:`Recorded ${Number(a.hours_worked)} hours against ${planned} rota hours; pay has not been changed.`,action_path:'/hr/scheduling',date:a.date,severity:'normal',baseline:planned,actual:Number(a.hours_worked),payload:{confidence:'sure',employee_id:a.employee_id,channel:'notification'}});}return out;
}
/** Uploaded records prove import activity, not connectivity. Preserve explicit heartbeat errors separately. */
export function uploadedFeeds(data:Record<string,Row[]>) {
 const rows:Row[]=[];
 const add=(key:string,name:string,area:string,v:string|null,sources:Row[],dateField:string,successField:string)=>{const valid=sources.filter(r=>!['failed','error','duplicate','reading','voided'].includes(r.status));rows.push({feed_key:key,name,area,venue_id:v,last_success_at:valid.map(r=>r[successField]).filter(Boolean).sort().pop()??null,complete_up_to:valid.map(r=>r[dateField]).filter(Boolean).sort().pop()??null});};
 for(const v of (data.venues??[]).filter(v=>v.is_active))add('sales:'+v.id,v.name+' sales','sales',v.id,(data.sales_records??[]).filter(s=>s.venue_id===v.id||s.venue===v.name),'date','created_at');
 for(const a of (data.bank_accounts??[]).filter(a=>a.is_active&&a.account_type!=='cash'&&!/^test(?:\s|$)/i.test(a.account_name??'')))add('bank:'+a.id,a.account_name,'bank',a.venue_id??null,(data.bank_statement_imports??[]).filter(i=>i.bank_account_id===a.id),'period_end','uploaded_at');
 for(const m of (data.payment_processor_merchants??[]).filter(m=>m.is_active))add('card:'+m.id,m.display_name+' card settlements','payments',m.venue_id??null,(data.payment_settlement_batches??[]).filter(b=>b.merchant_id===m.id),'transaction_date','created_at');
 return rows;
}
export function weeklyCostSignals(data:Record<string,Row[]>,day:string):Candidate[] {
 const out:Candidate[]=[];const sunday=addDays(day,-new Date(day+'T00:00:00Z').getUTCDay());
 for(const v of (data.venues??[]).filter(v=>v.is_active)){
 const windows=[{from:addDays(sunday,-6),to:sunday},{from:addDays(sunday,-13),to:addDays(sunday,-7)}];
 const sales=windows.map(w=>(data.sales_records??[]).filter(s=>(s.venue_id===v.id||s.venue===v.name)&&s.date>=w.from&&s.date<=w.to));
 // No partial sales week treated as a full denominator; closures are not zero-cost evidence.
 if(sales.some(rs=>new Set(rs.map(r=>r.date)).size<7))continue;
 const revenues=sales.map(rs=>rs.reduce((n,s)=>n+Number(s.total_sales??0),0));if(revenues.some(n=>n<=0))continue;
 for(const type of ['food','staff']){
 const costs=windows.map(w=>{if(type==='staff')return (data.hr_payroll??[]).filter(p=>p.accrual_journal_entry_id&&p.preparation?.cost_period?.start_date===w.from&&p.preparation?.cost_period?.end_date===w.to&&p.preparation?.cost_period?.venue_id===v.id).map(p=>Number(p.gross_salary??0)+Number(p.mpf_employer??0));
 const invoices=(data.invoices??[]).filter(i=>(i.venue_id===v.id||i.venue===v.name)&&i.invoice_date>=w.from&&i.invoice_date<=w.to&&i.review_status==='Approved');const ids=new Set(invoices.map(i=>i.id));return (data.invoice_line_items??[]).filter(l=>ids.has(l.invoice_id)&&(data.product_master??[]).some(p=>p.id===l.product_master_id&&/^food$/i.test(p.level1_category)&&!['asset','deposit'].includes(p.financial_treatment))).map(l=>Number(l.total??0));});
 if(costs.some(c=>!c.length))continue;const ratios=costs.map((c,i)=>c.reduce((n,x)=>n+x,0)/revenues[i]*100);const change=ratios[1]>0?(ratios[0]-ratios[1])/ratios[1]*100:0;if(Math.abs(change)<=40)continue;
 out.push({kind:type+'_cost_swing',area:type==='staff'?'hr':'procurement',venue_id:v.id,subject:sunday,title:`${v.name}: ${type==='food'?'food purchase':'staff'} cost share moved ${Math.round(Math.abs(change))}%`,why:`${ratios[0].toFixed(1)}% of recorded sales versus ${ratios[1].toFixed(1)}% the previous complete week${type==='food'?'; purchases, not stock consumption':''}.`,baseline:ratios[1],actual:ratios[0],date:sunday,severity:'normal',action_path:type==='staff'?'/hr/payroll':'/procurement/overview',payload:{channel:'notification',confidence:'likely',change_percent:Math.abs(change)}});
 }
 }return out;
}