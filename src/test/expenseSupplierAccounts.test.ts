import {describe,it,expect} from 'vitest';
import {splitAccount,matchExpenseSupplier,statementCharges,statementDifferences} from '@/utils/expenseSupplierAccounts';
describe('supplier accounts',()=>{
 const account={id:'meter',supplier_id:'clp',account_number:'82867-70477-2',split_method:'fixed',covers:[{venue_id:'Assembly',weight:60},{venue_id:'Caliente',weight:40}]};
 it('one account covers two venues in exact cents',()=>expect(splitAccount(100.01,account)).toEqual([{venue_id:'Assembly',amount:60.01},{venue_id:'Caliente',amount:40}]));
 it('two accounts can cover the same venue',()=>{const a={...account,split_method:'single',covers:[{venue_id:'Assembly'}]};expect([...splitAccount(20,a),...splitAccount(30,{...a,id:'second'})].reduce((n,v)=>n+v.amount,0)).toBe(50);});
 it('books current charges not the amount due',()=>expect(statementCharges({current_charges:18321,previous_balance:18706,amount_due:37027})).toBe(18321));
 it('accepts a zero-current-charge statement',()=>expect(statementCharges({current_charges:0,amount_due:18706})).toBe(0));
 it('matches meter before a conflicting company name',()=>expect(matchExpenseSupplier({account_number:'82867704772',vendor_name:'Towngas'},[account],[{id:'gas',name:'Towngas'}],[])).toEqual({kind:'account',supplier_id:'clp',account_id:'meter'}));
 it('known alias proposes an account without a new supplier',()=>expect(matchExpenseSupplier({vendor_name:'CLP'},[],[{id:'clp',name:'CLP Power Hong Kong Limited'}],[{supplier_id:'clp',alias:'CLP'}])).toEqual({kind:'company',supplier_id:'clp',account_id:null}));
 it('unknown companies require an answer',()=>expect(matchExpenseSupplier({vendor_name:'Unknown'},[],[],[]).kind).toBe('question'));
 it('unknown book balances are not asserted to match',()=>expect(statementDifferences({current_charges:10,amount_due:20},{})).toEqual(['amount_due']));
});