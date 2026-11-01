import {describe,it,expect} from 'vitest';
import {approveSelectedDrafts,selectedMonthlyDrafts,type MonthlyDraft} from '@/utils/expenseMonthlyApproval';
import {readFileSync} from 'node:fs';
const fixture:MonthlyDraft[]=[{id:'rent',kind:'accrual',name:'Rent',amount:380000},{id:'gas',kind:'bill',name:'Gas',amount:800},{id:'april',kind:'bill',name:'April rent',amount:380000,blocked:true}];
describe('explicit monthly expense approval',()=>{
 it('posts only ticked drafts in a non-production fixture, leaving unticked untouched',async()=>{const states=new Map(fixture.map(r=>[r.id,'draft']));await approveSelectedDrafts(fixture,{rent:true,gas:false,april:true},async items=>{for(const i of items)states.set(i.id,'posted');});expect([...states]).toEqual([['rent','posted'],['gas','draft'],['april','draft']]);});
 it('never approves a manual-booked duplicate',()=>expect(selectedMonthlyDrafts(fixture,{april:true})).toEqual([]));
 it('does not post anything without a selected draft',async()=>{let posts=0;await approveSelectedDrafts(fixture,{},async()=>{posts++;});expect(posts).toBe(0);});
 it('month-end migration rejects any surviving posting call',()=>{const sql=readFileSync('drizzle/migrations/0087_expense_explicit_monthly_approval.sql','utf8');expect(sql.includes("IF def LIKE '%PERFORM public.expense_accrual_approve%' OR def LIKE '%PERFORM public.expense_prepaid_release%' OR def LIKE '%PERFORM public.post_prepaid_line%' THEN RAISE EXCEPTION")).toBe(true);});
});
