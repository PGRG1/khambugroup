import { describe, it, expect } from 'vitest';
import { dateEvidence, reclassificationPair, unresolvedAccountLines, unresolvedDateEntries } from '../utils/booksReview';
describe('Books correction rules', () => {
  it('flags dates strictly beyond 60 days after today', () => {
    const entries = ['2026-12-30','2026-12-31'].map((entry_date,id)=>({id:String(id),entry_date,status:'posted',source_type:'invoice'}));
    expect(unresolvedDateEntries(entries,[],'2026-01-01','2026-10-31').map(e=>e.entry_date)).toEqual(['2026-12-31']);
  });
  it('flags before first sales, not the first sales day', () => {
    const entries = ['2026-01-01','2026-01-02'].map((entry_date,id)=>({id:String(id),entry_date,status:'posted',source_type:'invoice'}));
    expect(unresolvedDateEntries(entries,[],'2026-01-02','2026-10-31').map(e=>e.entry_date)).toEqual(['2026-01-01']);
  });
  it('retains but stops asking about confirmed reversed originals', () => {
    const entries=[{id:'old',entry_date:'2006-07-05',status:'posted',source_type:'sales_summary'}];
    expect(unresolvedDateEntries(entries,[{original_entry_id:'old',kind:'date'}],'2026-01-01','2026-10-31')).toEqual([]);
    expect(entries[0].status).toBe('posted');
  });
  it('only unresolved posted missing lines need correction', () => {
    const lines=[{id:'a',entry_id:'p',mapping_status:'missing',account_id:'suspense'},{id:'b',entry_id:'p',mapping_status:'missing',account_id:'suspense'},{id:'c',entry_id:'draft',mapping_status:'missing',account_id:'suspense'}];
    expect(unresolvedAccountLines(lines,[{original_entry_id:'p',kind:'account',line_id:'a'}],new Set(['p'])).map(l=>l.id)).toEqual(['b']);
  });
  it('corrects a HK$296 debit without changing the total or deleting history', () => {
    expect(reclassificationPair(296,0,'old','new')).toEqual([{account_id:'old',debit:0,credit:296},{account_id:'new',debit:296,credit:0}]);
  });
  it('corrects a HK$82 credit in the same direction', () => {
    expect(reclassificationPair(0,82,'old','new')).toEqual([{account_id:'old',debit:82,credit:0},{account_id:'new',debit:0,credit:82}]);
  });
  it('refuses the same account and invalid values', () => {
    expect(()=>reclassificationPair(296,0,'old','old')).toThrow();
    expect(()=>reclassificationPair(-1,0,'old','new')).toThrow();
  });
  it('labels upload dates as evidence rather than invoice dates', () => {
    expect(dateEvidence({created_at:'2026-10-20T12:00:00Z',invoice_date:'2006-07-05'})).toEqual([{date:'2026-10-20',reason:'Record created date'}]);
  });
});