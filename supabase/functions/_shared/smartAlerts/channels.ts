import {addDays, salesBaseline, weekday, type Candidate, type Row} from './rules.ts';
import {impact} from './coverage.ts';

export const NOTIFICATION_KINDS = new Set(['sales_low','sales_high','sales_record','supplier_price_rise','delivery_short','sick_leave','no_show','late_clock_in','overtime_rota','food_cost_swing','staff_cost_swing','user_ask']);
export const channelFor = (a: Pick<Candidate,'kind'>) => NOTIFICATION_KINDS.has(a.kind) ? 'notification' : 'work';
export function businessRole(role:string, jobTitle='') {
 if (['owner','admin','tenant_admin','platform_admin'].includes(role)) return 'owner';
 if (/chef|purchas|procurement/i.test(jobTitle+' '+role)) return 'purchasing';
 if (/account|finance/i.test(jobTitle+' '+role)) return 'accountant';
 if (/manager/i.test(jobTitle+' '+role)) return 'venue manager';
 return 'staff';
}
export function receives(a:Pick<Candidate,'kind'|'area'|'payload'>,role:string,channel:'work'|'notification') {
 if (channelFor(a as Candidate)!==channel) return false;
 if (role==='owner') return channel==='work'||Number(a.payload.change_percent??0)>40||a.kind==='sales_record'||a.kind==='user_ask';
 if (role==='venue manager') return channel==='work' ? ['sales','hr','procurement'].includes(a.area) : ['hr','procurement'].includes(a.area);
 if (role==='purchasing') return a.area==='procurement';
 if (role==='accountant') return channel==='work'&&['bank','payments','expenses','finance','sales'].includes(a.area);
 return false;
}
export function operationalSignals(data:Record<string,Row[]>,day:string):Candidate[] {
 const out:Candidate[]=[];
 const venueId=(r:Row)=>r.venue_id??(data.venues??[]).find(v=>v.name===r.venue)?.id??null;
 const employee=(id:string)=>(data.hr_employees??[]).find(e=>e.id===id);
 const name=(e:Row|undefined)=>e?[e.first_name,e.last_name].filter(Boolean).join(' '):'Team member';
 const emit=(kind:string,area:string,subject:string,title:string,why:string,path:string,v:string|null,date=day,payload:Row={})=>out.push({kind,area,subject,title,why,action_path:path,venue_id:v,date,severity:'normal',baseline:null,actual:null,payload:{confidence:'sure',...payload}});
 const group=(rows:Row[],kind:string,area:string,label:string,path:string,dateField='created_at')=>{
  const groups=new Map<string|null,Row[]>();for(const r of rows){const id=venueId(r);groups.set(id,[...(groups.get(id)??[]),r]);}
  for(const [v,rs] of groups)emit(kind,area,v??'group',`${rs.length} ${label}`,`Review the existing records in ${label.replace(/ to .*$/,'')}; nothing has been approved by Bani.`,path,v,day,{record_ids:rs.map(r=>r.id),source_date:rs.map(r=>r[dateField]).filter(Boolean).sort().pop()});
 };
 group((data.invoices??[]).filter(r=>['Draft','To approve','Under Review'].includes(r.review_status)),'invoice_review','procurement','invoices to review','/procurement/invoices');
 group((data.goods_received_notes??[]).filter(r=>['pending','draft','disputed'].includes(String(r.status).toLowerCase())),'delivery_review','procurement','deliveries to check','/procurement/receiving');
 group((data.purchase_orders??[]).filter(r=>['pending','pending_approval','submitted','to approve'].includes(String(r.status).toLowerCase())),'order_approval','procurement','orders to approve','/procurement/purchase-orders');
 group((data.expense_bills??[]).filter(r=>['draft','pending','pending_approval'].includes(r.approval_status)),'bill_approval','expenses','bills to approve','/expenses/bills');
 group((data.hr_leave_requests??[]).filter(r=>r.status==='pending').map(r=>({...r,venue_id:employee(r.employee_id)?.venue_id})),'leave_request','hr','leave requests to review','/hr/leave');
 group((data.hr_swap_requests??[]).filter(r=>r.status==='pending').map(r=>({...r,venue_id:(data.hr_shifts??[]).find(s=>s.id===r.shift_id)?.venue_id})),'swap_request','hr','shift swaps to review','/hr/scheduling');
 group((data.hr_attendance??[]).filter(r=>r.date<=day&&!r.confirmed_at&&(r.hours_worked!=null||r.clock_in)).filter(r=>{
  const shifts=(data.hr_shifts??[]).filter(s=>s.employee_id===r.employee_id&&s.shift_date===r.date&&s.status!=='cancelled');
  return shifts.length===0||r.status==='mismatch'||Number(r.overtime_hours)>0;
 }),'timesheet_check','hr','timesheets not matching rota','/hr/scheduling');
 group((data.hr_payroll??[]).filter(r=>r.preparation&&!r.accrual_journal_entry_id),'payroll_confirm','hr','payroll records to confirm','/hr/payroll');
 group((data.sales_records??[]).filter(r=>r.date<=day&&[r.deposits_taken,r.deposits_used,r.vouchers_sold,r.vouchers_used].some(n=>Number(n)>0)&&!r.journal_entry_id),'sales_deferred_check','sales','deposit or voucher days to check','/sales-data','date');
 const inWeek=(d:unknown)=>typeof d==='string'&&d.slice(0,10)>=addDays(day,-6)&&d.slice(0,10)<=day;
 for(const r of data.hr_leave_requests??[]){const type=(data.hr_leave_types??[]).find(t=>t.id===r.leave_type_id);if(r.status!=='approved'||!/sick/i.test(type?.name??'')||!inWeek(r.approved_at??r.created_at))continue;const e=employee(r.employee_id);emit('sick_leave','hr',r.id,`${name(e)}: sick leave recorded`,`${r.start_date} to ${r.end_date}; recorded leave, not a prediction.`,'/hr/leave',venueId(e??{}),(r.approved_at??r.created_at).slice(0,10));}
 for(const r of data.hr_attendance??[]){if(!inWeek(r.date))continue;const e=employee(r.employee_id);if(['no_show','absent'].includes(r.status))emit('no_show','hr',r.id,`${name(e)}: no-show recorded`,'Attendance records a no-show.','/hr/scheduling',venueId(r),r.date);if(r.status==='late')emit('late_clock_in','hr',r.id,`${name(e)}: late clock-in recorded`,'Attendance records a late arrival.','/hr/scheduling',venueId(r),r.date);}
 for(const r of data.hr_shifts??[]){if(!inWeek(r.shift_date)||r.status==='cancelled')continue;if(r.no_show&&r.no_show_decided_at&&!out.some(a=>a.kind==='no_show'&&a.date===r.shift_date&&a.payload.employee_id===r.employee_id))emit('no_show','hr','shift:'+r.id,`${name(employee(r.employee_id))}: no-show recorded`,'The rota has an explicitly recorded no-show decision.','/hr/scheduling',venueId(r),r.shift_date,{employee_id:r.employee_id});}
 for(const g of data.goods_received_notes??[]){if(!inWeek(g.updated_at??g.received_date)||String(g.status).toLowerCase()!=='disputed')continue;const short=(data.grn_items??[]).filter(l=>l.grn_id===g.id&&l.issue&&Number(l.quantity_received)<Number(l.quantity_invoiced??l.quantity_ordered));if(short.length)emit('delivery_short','procurement',g.id,`${g.grn_number}: delivery short`,`${short.length} lines have a recorded delivery problem; the delivery check is the evidence.`,'/procurement/receiving',venueId(g),(g.updated_at??g.received_date).slice(0,10),{line_ids:short.map(l=>l.id)});}
 for(const v of data.venues??[]){const totals=new Map<string,number>();for(const s of (data.sales_records??[]).filter(s=>venueId(s)===v.id&&s.date<=day))totals.set(s.date,(totals.get(s.date)??0)+Number(s.total_sales??0));const days=[...totals].map(([date,value])=>({date,value}));for(const d of days.filter(d=>inWeek(d.date))){const prior=days.filter(p=>p.date<d.date);const {usual}=salesBaseline(days,d.date);if(prior.length>=28&&usual!==null&&d.value>Math.max(...prior.map(p=>p.value)))emit('sales_record','sales',d.date,`${v.name}: record sales day`,'Above every earlier recorded day; compared with this venue’s own history.','/sales-data?date='+d.date+'&venue='+v.id,v.id,d.date,{change_percent:usual>0?(d.value-usual)/usual*100:0});}}
 return out;
}
export function splitChannels(rows:Candidate[]) {
 const bankRoots=rows.filter(a=>a.kind==='missing_bank_statement');
 const work=rows.filter(a=>channelFor(a)==='work'&&!['learning','feed_setup'].includes(a.kind)&&!(bankRoots.length&&['overdue_bill','unmatched_card_payouts'].includes(a.kind))).map(a=>({ ...a,payload:{...a.payload,channel:'work',summary_only:false} }));
 const workImpact=(a:Candidate)=>impact({...a,payload:{...a.payload,question:false}});
 return {work:work.sort((a,b)=>workImpact(b)-workImpact(a)),notifications:rows.filter(a=>channelFor(a)==='notification').map(a=>({...a,payload:{...a.payload,channel:'notification'}}))};
}
export function ownerGreeting(rows:Row[],day:string,venues:Row[]) {
 const totals=new Map<string,number>();for(const r of rows.filter(r=>r.date<=day))totals.set(r.date,(totals.get(r.date)??0)+Number(r.total_sales??0));
 const actual=totals.get(day);if(actual===undefined)return 'Yesterday’s sales are not recorded yet, so I cannot compare them with usual.';
 let usual=0;for(const v of venues.filter(v=>v.is_active)){const days=new Map<string,number>();for(const r of rows.filter(r=>r.venue_id===v.id||r.venue===v.name))days.set(r.date,(days.get(r.date)??0)+Number(r.total_sales??0));const b=salesBaseline([...days].map(([date,value])=>({date,value})),day).usual;if(b===null)return 'Yesterday’s sales are recorded; there is not enough comparable history to call them usual.';usual+=b;}
 if(!usual)return 'Yesterday’s sales are recorded; a usual comparison is not available.';
 const pct=Math.round(Math.abs(actual-usual)/usual*100);return pct<5?'Yesterday finished close to usual.':`Yesterday finished ${pct}% ${actual<usual?'below':'above'} usual for ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][weekday(day)]}.`;
}