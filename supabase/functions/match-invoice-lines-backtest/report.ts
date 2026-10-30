import type { Decision } from '../_shared/matchInvoiceLines/policy.ts';
export type ResultRow = { invoice_id: string; line_id: string; expected_product_id: string | null; predicted_product_id: string | null; alternatives: string[]; decision: Decision; reason: string; correct: boolean };
export function summarize(rows: ResultRow[]) {
  const of = (d: Decision) => rows.filter(r => r.decision === d);
  const count = (d: Decision) => ({ right: of(d).filter(r => r.correct).length, wrong: of(d).filter(r => !r.correct).length });
  return { lines_tested: rows.length, sure: count('sure'), probably: { ...count('probably'), right_item_in_alternatives: of('probably').filter(r => !r.correct && r.expected_product_id && r.alternatives.includes(r.expected_product_id)).length }, cant_tell: of('cant_tell').length, new: { total: of('new').length, actually_had_existing_item: of('new').filter(r => r.expected_product_id !== null).length }, not_a_product: of('not_a_product').length,
    wrong_examples: rows.filter(r => !r.correct && r.expected_product_id !== null).sort((a, b) => Number(b.decision === 'sure') - Number(a.decision === 'sure')).slice(0, 10) };
}
export function randomSample<T>(rows: T[], size: number): T[] {
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) {
    // Rejection sampling avoids modulo bias.
    const bound = i + 1, limit = Math.floor(0x100000000 / bound) * bound;
    let value: number;
    do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
    const j = value % bound;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}