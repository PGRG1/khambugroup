import {describe,it,expect} from 'vitest';
import {restaurantPL} from '@/utils/restaurantPL';
import {financeProfit} from '@/utils/financeOverview';
import type {BookAccount,BookEntry,BookLine} from '@/utils/financeClose';
const accounts:BookAccount[]=[['s','4000','Sales','revenue'],['d','4090','Discounts','revenue'],['f','5000','Food','cogs'],['w','6000','Wages','opex'],['r','6100','Rent','opex'],['fx','FX-R','Realised FX','other_expense']].map(([id,code,name,account_type])=>({id,code,name,account_type,is_cash:false,normal_side:'debit'}));
const entries:BookEntry[]=[{id:'e',entry_date:'2026-10-10',status:'posted',source_type:'manual',source_id:null,memo:''},{id:'draft',entry_date:'2026-10-10',status:'draft',source_type:'manual',source_id:null,memo:''},{id:'outside',entry_date:'2026-11-01',status:'posted',source_type:'manual',source_id:null,memo:''}];
const lines:BookLine[]=[['s',0,1000],['d',50,0],['f',200,0],['w',300,0],['r',100,0],['fx',10,0]].map(([id,debit,credit])=>({id:String(id),account_id:String(id),entry_id:'e',debit:Number(debit),credit:Number(credit),venue:'Restaurant',mapping_status:null}));
const periods=[{label:'Oct',from:'2026-10-01',to:'2026-10-31'}];
describe('Restaurant statement',()=>{
 it('preserves posted operations profit and keeps discounts signed',()=>{
 const rows=restaurantPL(entries,lines,accounts,[],periods),p=financeProfit(entries,lines,accounts,[],'2026-10');
 expect(rows.find(r=>r.id==='net-sales')?.values).toEqual([950]);
 expect(rows.find(r=>r.id==='d')?.values).toEqual([-50]);
 expect(rows.find(r=>r.id==='profit')?.values).toEqual([p.profit]);
 expect(p.profit).toBe(340);
 });
 it('excludes drafts and outside dates, and totals exact selected ranges',()=>{
 const extra:BookLine={...lines[0],id:'extra',entry_id:'outside',credit:4000};
 const draft={...extra,id:'draftline',entry_id:'draft'};
 const rows=restaurantPL(entries,[...lines,extra,draft],accounts,[],periods);
 expect(rows.find(r=>r.id==='net-sales')?.values).toEqual([950]);
 });
 it('shows payroll reconciliation without changing profit or losing detail totals',()=>{
 const payroll=[{year:2026,month:10,gross_salary:310,mpf_employer:10,accrual_journal_entry_id:'e'}];
 const rows=restaurantPL(entries,lines,accounts,payroll,periods);
 expect(rows.find(r=>r.id==='staff')?.values).toEqual([320]);
 expect(rows.find(r=>r.id==='running')?.values).toEqual([80]);
 expect(rows.find(r=>r.id==='payroll-reconciliation')?.values).toEqual([20]);
 expect(rows.find(r=>r.id==='profit')?.values).toEqual([340]);
 expect(rows.find(r=>r.id==='prime-ratio')?.values[0]).toBeCloseTo(520/950*100);
 });
});
