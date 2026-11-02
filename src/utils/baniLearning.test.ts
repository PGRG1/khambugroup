import {describe,it,expect} from 'vitest';
import {fromRules,fromNotes,fromFeedback,usedText} from './baniLearning';
import {sameNote} from './noteSameness';
const l={people:{u:'Pat'},suppliers:{s:'Ming Kee Seafood'},products:{p:'Jim Beam bourbon'},venues:{assembly:'Assembly'}};
describe('What Bani learned',()=>{
  it('hides Z-report date repairs',()=>{expect(fromRules([{id:'1',domain:'revenue',input_pattern:{kind:'date'},output_action:{trust:'source_date_correction'}}],l)).toHaveLength(0);});
  it('bank rule sentence',()=>{expect(fromRules([{id:'1',domain:'bank_recon',input_pattern:{contains:'KPAY MERCHANT SERVICE LIMITED'},output_action:{suggested_category:'KPay Settlement'},hit_count:0}],l)[0].sentence).toBe('Bank lines from “KPAY MERCHANT SERVICE LIMITED” are KPay settlements');});
  it('never invents usage',()=>{expect(usedText(10,null,true)).toBe('Used 10 times');expect(usedText(0,null,true)).toBe('Not used yet');expect(usedText(5,null,false)).toBe('Not recorded');});
  it('invoice choice sentence',()=>{expect(fromFeedback([{id:'1',supplier_id:'s',printed_description:'JIM BEAM (1L)',chosen_product_id:'p'}],l)[0].sentence).toBe('“JIM BEAM (1L)” on invoices is your Jim Beam bourbon');});
  it('collapses repeated notes for the same scope',()=>{const n=(id:string,note:string,k='assembly')=>({id,scope_type:'venue',scope_key:k,note,created_at:id});
    const r=fromNotes([n('1','Always prompt to add a note when saving a sales record.'),n('2','always prompt to add a note when saving a sales record'),n('3','Always prompt for a note when saving a sales record.'),n('4','Always ask if the user would like to add a note when saving a sales record.'),n('5','Always prompt to add a note when saving a sales record.','hanabi')],l);
    expect(r).toHaveLength(2);expect(r[0].ids).toHaveLength(4);});
  it('different notes stay separate',()=>{expect(sameNote('Invoices are due at month end','Deliveries come on Tuesdays')).toBe(false);});
});
