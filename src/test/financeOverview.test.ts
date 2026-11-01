import {describe,it,expect} from 'vitest';
import {closeRows,closeReady,financeProfit,reliableFinanceMonth,type FinanceBank,type FinanceBatch} from '@/utils/financeOverview';
import type {MonthCheck,BookAccount,BookEntry,BookLine} from '@/utils/financeClose';
const check:MonthCheck={month:'2026-05',sales_days:62,invoices:10,payroll:true,rent:'complete',bank_lines:1,bank_unmatched:0,missing:[],complete:true};
const bank:FinanceBank[]=[{id:'bank',txn_date:'2026-05-31',status:'matched',matched_record_id:'batch'}];
const batches:FinanceBatch[]=[{id:'batch',transaction_date:'2026-05-31',bank_transaction_id:'bank',processor_id:'p',net_settlement:100}];
describe('Finance overview facts',()=>{
 it('closes only when every displayed check is done or skipped and server agrees',()=>{expect(closeReady(check,closeRows(check,bank,batches),'2026-11-01')).toBe(true);expect(closeReady(check,closeRows(check,bank,[]),'2026-11-01')).toBe(false);expect(closeReady({...check,complete:false},closeRows(check,bank,batches),'2026-11-01')).toBe(false);});
 it('does not close the current month',()=>expect(closeReady(check,closeRows(check,bank,batches),'2026-05-31')).toBe(false));
 it('requires bank AND card matching for reliability',()=>{expect(reliableFinanceMonth([check],batches,bank,'2026-11-01')).toBe('2026-05');expect(reliableFinanceMonth([check],[],bank,'2026-11-01')).toBeUndefined();});
 const accounts=[['sales','4000','revenue'],['food','5100','cogs'],['staff','6010','opex'],['other','6150','opex']].map(([id,code,account_type])=>({id,code,account_type,name:id,is_cash:false,normal_side:'debit'})) as BookAccount[];
 const entry=(id:string,date:string):BookEntry=>({id,entry_date:date,status:'posted',source_type:id==='pay'?'payroll_accrual':'manual',source_id:null,memo:''});
 const line=(id:string,account_id:string,debit:number,credit:number,entry_id='pay'):BookLine=>({id,entry_id,account_id,debit,credit,venue:null,mapping_status:null});
 it('shows May payroll cost, book profit HK$37,850 and 4.4% without replacing journal profit',()=>{const result=financeProfit([entry('pay','2026-05-31')],[line('1','sales',0,852251),line('2','food',180000,0),line('3','staff',255068.2,0),line('4','other',379333.11,0)],accounts,[{year:2026,month:5,gross_salary:247407.7,mpf_employer:7660.5,accrual_journal_entry_id:'pay'}],'2026-05');expect(result.staff).toBeCloseTo(255068.20,2);expect(result.running).toBeCloseTo(379333.11,2);expect(Math.round(result.profit)).toBe(37850);expect(Number((result.profit/result.sales*100).toFixed(1))).toBe(4.4);});
 it('sums the current Jan–May book fixture without adding an unsupported HK$5',()=>{const sales=[817100,779567,913131,858095,852251],costs=[853215.47,807704.47,799755.68,902436.31,814401.31];const entries=sales.map((_,i)=>entry(String(i),`2026-0${i+1}-28`));const lines=sales.flatMap((amount,i)=>[line(`s${i}`,'sales',0,amount,String(i)),line(`c${i}`,'other',costs[i],0,String(i))]);expect(Math.round(sales.reduce((n,_,i)=>n+financeProfit(entries,lines,accounts,[],`2026-0${i+1}`).profit,0))).toBe(42631);});
 it('never treats unposted payroll as Staff cost',()=>expect(financeProfit([],[],accounts,[{year:2026,month:5,gross_salary:247407.7,mpf_employer:7660.5,accrual_journal_entry_id:'pay'}],'2026-05').staff).toBeNull());
});
