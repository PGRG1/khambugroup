import { describe, it, expect } from 'vitest';
import { suggestTransferPair, transferCandidates } from '@/utils/transferPairs';
const L = (id: string, acct: string, d: string, inn: number, out: number) => ({ id, bank_account_id: acct, txn_date: d, money_in: inn, money_out: out });
describe('transfer pairing', () => {
  it('pairs HK$7,800 out with US$1,000 in at a 7.79 reference', () => {
    const p = suggestTransferPair([L('o', 'hkd', '2026-10-20', 0, 7800)], [L('x', 'usd', '2026-10-20', 900, 0), L('i', 'usd', '2026-10-21', 1000, 0)], 1 / 7.79);
    expect(p?.in.id).toBe('i');
  });
  it('only offers lines within 3 days in the right direction', () => {
    const c = transferCandidates([L('a', 'hkd', '2026-10-24', 0, 50), L('b', 'hkd', '2026-10-21', 50, 0), L('c', 'hkd', '2026-10-22', 0, 50)], 'hkd', 'out', '2026-10-20');
    expect(c.map(x => x.id)).toEqual(['c']);
  });
  it('same currency needs equal amounts', () => {
    expect(suggestTransferPair([L('o', 'a', '2026-10-20', 0, 100)], [L('i', 'b', '2026-10-20', 99, 0)], null)).toBeNull();
  });
});
