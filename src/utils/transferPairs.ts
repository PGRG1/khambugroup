export type TransferLine = { id: string; bank_account_id: string; txn_date: string; money_in: number; money_out: number; transfer_pair_id?: string | null; status?: string | null };

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/** Lines that could be the other side of a transfer: unpaired, in the right direction, within ±3 days. */
export function transferCandidates(lines: TransferLine[], accountId: string, side: 'out' | 'in', date: string): TransferLine[] {
  return lines
    .filter(l => l.bank_account_id === accountId && !l.transfer_pair_id && l.status !== 'matched' && (side === 'out' ? Number(l.money_out) > 0 : Number(l.money_in) > 0) && days(l.txn_date, date) <= 3)
    .sort((a, b) => days(a.txn_date, date) - days(b.txn_date, date));
}

/**
 * Suggest the best out/in pair. Same currency: amounts must be equal.
 * Different currency: the implied rate (in ÷ out) must be within 3% of the reference rate (to per from).
 */
export function suggestTransferPair(outs: TransferLine[], ins: TransferLine[], refRate: number | null): { out: TransferLine; in: TransferLine } | null {
  let best: { out: TransferLine; in: TransferLine; score: number } | null = null;
  for (const o of outs) for (const i of ins) {
    if (days(o.txn_date, i.txn_date) > 3) continue;
    const out = Number(o.money_out), inn = Number(i.money_in);
    let gap: number;
    if (refRate == null) { if (Math.abs(out - inn) > 0.005) continue; gap = 0; }
    else { gap = Math.abs(inn / out - refRate) / refRate; if (gap > 0.03) continue; }
    const score = gap * 100 + days(o.txn_date, i.txn_date);
    if (!best || score < best.score) best = { out: o, in: i, score };
  }
  return best ? { out: best.out, in: best.in } : null;
}
