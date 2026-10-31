import {describe,it,expect} from 'vitest';
import {daysLate,inLateBucket,medianSupplierTerms,dueDateFromTerms,proposeSupplierMatches,supplierAccountRows,openAccountInvoices,type AccountInvoice} from '@/utils/supplierAccounts';
const inv=(id:string,date='2026-01-01',open=100):AccountInvoice=>({id,supplier_id:'s',supplier_name:'Supplier',invoice_date:date,invoice_number:id,venue:'A',due_date:null,outstanding_amount:open,payment_status:'unpaid',review_status:'Approved'});
const payment=(id:string,amount=100)=>({id,supplier_id:'s',payment_date:'2026-03-01',amount,allocated_amount:0,unallocated_amount:amount});
describe('Supplier Accounts rules',()=>{
 it('no due date is never overdue',()=>expect(daysLate(null,'2026-10-31')).toBe(0));
 it('late buckets have exact nonoverlapping boundaries',()=>{for(const [date,bucket] of [['2026-10-30','1-30'],['2026-10-01','1-30'],['2026-09-30','31-60'],['2026-09-01','31-60'],['2026-08-31','60+']] as const){expect(inLateBucket({...inv('i'),due_date:date},bucket,'2026-10-31')).toBe(true);}expect(inLateBucket({...inv('i'),due_date:'2026-09-01'},'60+','2026-10-31')).toBe(false);});
 it('missing-date switch excludes dated invoices',()=>{expect(inLateBucket(inv('i'),'no-date','2026-10-31')).toBe(true);expect(inLateBucket({...inv('i'),due_date:'2026-11-01'},'no-date','2026-10-31')).toBe(false);});
 it('supplier summary sums only open amounts and dates Last invoice from invoices',()=>{const rows=supplierAccountRows([inv('a','2026-01-01',70),{...inv('b','2026-02-01',30),due_date:'2026-02-15'}],[payment('p')],'2026-10-31');expect(rows[0].owed).toBe(100);expect(rows[0].overdue).toBe(30);expect(rows[0].noDueCount).toBe(1);expect(rows[0].lastInvoice).toBe('2026-02-01');});
 it('does not invent terms without evidence',()=>expect(medianSupplierTerms([inv('i')])).toEqual({days:null,samples:0}));
 it('terms use median not mean and ignore backwards dates',()=>{expect(medianSupplierTerms([{invoice_date:'2026-01-01',due_date:'2026-01-11'},{invoice_date:'2026-01-01',due_date:'2026-01-31'},{invoice_date:'2026-01-01',due_date:'2026-04-11'},{invoice_date:'2026-01-02',due_date:'2026-01-01'}])).toEqual({days:30,samples:3});});
 it('rounds half-day median to the next whole day',()=>expect(medianSupplierTerms([{invoice_date:'2026-01-01',due_date:'2026-01-31'},{invoice_date:'2026-01-01',due_date:'2026-02-01'}]).days).toBe(31));
 it('terms add calendar days across months',()=>expect(dueDateFromTerms('2026-01-31',30)).toBe('2026-03-02'));
 it('rejects negative and fractional terms',()=>{expect(()=>dueDateFromTerms('2026-01-01',-1)).toThrow();expect(()=>dueDateFromTerms('2026-01-01',1.5)).toThrow();});
 it('proposes oldest invoices without double allocating across payments',()=>{const rows=proposeSupplierMatches('s',[payment('p1',80),payment('p2',80)],[inv('new','2026-02-01'),inv('old')]);expect(rows.map(r=>[r.payment_id,r.invoice_id,r.amount])).toEqual([['p1','old',80],['p2','old',20],['p2','new',60]]);});
 it('keeps supplier, disputes and post-payment invoices out of automatic matching',()=>{const rows=proposeSupplierMatches('s',[payment('p')],[{...inv('other'),supplier_id:'other'},{...inv('disputed'),review_status:'Disputed'},inv('future','2026-04-01')]);expect(rows).toEqual([]);});
 it('only spends the unallocated portion',()=>expect(proposeSupplierMatches('s',[{...payment('p'),allocated_amount:75,unallocated_amount:25}],[inv('i')])[0].amount).toBe(25));
 it('voided invoices are never open',()=>expect(openAccountInvoices([{...inv('i'),payment_status:'voided'}])).toEqual([]));
});
