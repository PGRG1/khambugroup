import {describe,it,expect} from 'vitest';
import {purchasingChecks,priceMoves,itemRanking,categoryRanking,percentage,type OverviewInvoice} from '@/utils/purchasingOverview';
import {directoryRows,directoryDuplicates,type DirectorySupplier} from '@/utils/supplierDirectory';
const invoices=(n:number,total=100)=>Array.from({length:n},(_,i)=>({id:String(i),supplier_id:'s',total_amount:total,invoice_date:'2026-10-01',discount:0,venue:'Caliente',created_at:'',review_status:'Approved',has_disputes:false} satisfies OverviewInvoice));
describe('Purchasing incomplete periods',()=>{
 it('under 25% of previous invoice count waits',()=>expect(purchasingChecks(invoices(15),invoices(64),10000,10000).waiting).toBe(true));
 it('exactly 25% does not wait',()=>expect(purchasingChecks(invoices(16),invoices(64),10000,10000).waiting).toBe(false));
 it('no previous invoices cannot imply missing invoices',()=>expect(purchasingChecks(invoices(0),invoices(0),10000,10000).waiting).toBe(false));
 it('exactly three points does not flag',()=>expect(purchasingChecks(invoices(1,1300),invoices(1,1000),10000,10000).pointChange).toBeNull());
 it('more than three points flags',()=>expect(purchasingChecks(invoices(1,1400),invoices(1,1000),10000,10000).pointChange).toBe(4));
});
describe('Same-unit price moves and category split',()=>{
 const products=new Map([['p',{id:'p',internal_product_name:'Potato',financial_treatment:'Expense',level1_category:'Food',unit:'kg'}]]);
 const line=(price:number,unit='kg')=>({invoice_id:'i',product_master_id:'p',unit_price:price,unit,quantity:1,total:price});
 it('Potato 12.50 to 21.50 is a 72% price move',()=>expect(priceMoves(itemRanking([line(21.5)],[line(12.5)],products))[0].priceChange).toBe(72));
 it('different units never compare',()=>expect(priceMoves(itemRanking([line(21.5,'bag')],[line(12.5)],products))).toEqual([]));
 it('exactly 5% is omitted',()=>expect(priceMoves(itemRanking([line(105)],[line(100)],products))).toEqual([]));
 it('exactly 20% does not become a top warning',()=>expect(priceMoves(itemRanking([line(120)],[line(100)],products),20)).toEqual([]));
 it('Food split uses level one spend divided by sales',()=>{const categories=categoryRanking([line(50)],invoices(1),products);expect(percentage(categories.find(c=>c.name==='Food')?.value??0,1000)).toBe(5);});
});
describe('Unified supplier directory',()=>{
 const supplier=(id:string):DirectorySupplier=>({id,name:id,directory_merged_into:null,is_active:true,contact_person:null,email:null,phone:null,address:null,payment_terms:null,delivery_days:[],notes:null});
 it('no invoice ever is archived, never removed',()=>expect(directoryRows([supplier('s')],[],'2026')[0].archived).toBe(true));
 it('expense-only supplier is active in same list',()=>expect(directoryRows([supplier('s')],[{id:'b',supplier_id:'s',kind:'expense',date:'2026-10-01',number:'b',total:50,categories:['Cleaning']}],'2026')[0]).toMatchObject({archived:false,thisYear:1,categories:['Cleaning']}));
 it('directory merge combines histories without changing source IDs',()=>{const records=[{id:'b',supplier_id:'a',kind:'expense' as const,date:'2026-10-01',number:'b',total:50,categories:['Cleaning']}];const rows=directoryRows([{...supplier('a'),directory_merged_into:'b'},supplier('b')],records,'2026');expect(rows).toHaveLength(1);expect(rows[0].thisYear).toBe(1);expect(records[0].supplier_id).toBe('a');});
 it('CLP and CLP Power Hong Kong Limited are possible duplicates',()=>expect(directoryDuplicates([{id:'a',name:'CLP'},{id:'b',name:'CLP Power Hong Kong Limited'}])).toHaveLength(1));
});