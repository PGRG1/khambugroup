import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyChecks, beforeAsOf, canAdmin, kindOf, median, type Candidate, type Line, type Prediction } from './policy.ts';
const candidate: Candidate = { id: 'item-a', name: 'Guinness', kind: 'product', units: ['case'], prices: [], median_price: 100, descriptions: [], codes: [], times_bought: 6, last_bought: '2026-01-01', pack: '24 cans' };
const line: Line = { line_index: 0, description: 'Guinness', item_code: null, unit: 'case', quantity: 2, unit_price: 100, amount: 200 };
const prediction: Prediction = { line_index: 0, decision: 'sure', product_master_id: 'item-a', alternatives: [], reason: 'Same unit and price as 6 previous lines.' };
const check = (l: Partial<Line> = {}, c: Partial<Candidate> = {}, p: Partial<Prediction> = {}) => applyChecks([{ ...line, ...l }], [{ ...prediction, ...p }], [{ ...candidate, ...c }], ['item-a'])[0];
Deno.test('price exactly 25% from median stays sure', () => assertEquals(check({ unit_price: 125, amount: 250 }).decision, 'sure'));
Deno.test('price more than 25% from median becomes probably', () => { const r = check({ unit_price: 125.01, amount: 250.02 }); assertEquals(r.decision, 'probably'); assertStringIncludes(r.reason, '25%'); });
Deno.test('no price history skips price gate', () => assertEquals(check({ unit_price: 999, amount: 1998 }, { median_price: null }).decision, 'sure'));
Deno.test('inconsistent unit becomes probably', () => assertEquals(check({ unit: 'bottle' }).decision, 'probably'));
Deno.test('missing unit is not sure', () => assertEquals(check({ unit: null }).decision, 'probably'));
Deno.test('math difference exactly 1 stays sure', () => assertEquals(check({ amount: 201 }).decision, 'sure'));
Deno.test('math difference greater than 1 becomes probably', () => assertEquals(check({ amount: 201.01 }).decision, 'probably'));
Deno.test('unknown predicted id is dropped', () => { const r = check({}, {}, { product_master_id: 'invented' }); assertEquals(r.product_master_id, null); assertEquals(r.decision, 'cant_tell'); });
Deno.test('unknown alternatives are dropped and limited to 3', () => assertEquals(check({}, {}, { alternatives: ['invented', 'item-a'] }).alternatives, []));
for (const [name, description, quantity] of [['empty', '', 1], ['deposit', 'Keg deposit', 1], ['return', 'Returned Guinness', -1]] as const) {
  Deno.test(`${name} line cannot map to full product`, () => assertEquals(check({ description, quantity }).product_master_id, null));
}
Deno.test('full product cannot map to deposit item', () => assertEquals(check({}, { kind: 'deposit' }).product_master_id, null));
Deno.test('dedicated deposit item can match deposit line', () => assertEquals(check({ description: 'Keg deposit' }, { kind: 'deposit' }).decision, 'sure'));
Deno.test('same item on two invoice lines makes both probably', () => assertEquals(applyChecks([line, { ...line, line_index: 1 }], [prediction, { ...prediction, line_index: 1 }], [candidate], ['item-a']).map(p => p.decision), ['probably', 'probably']));
Deno.test('no confidence cannot be sure', () => assertEquals(check({}, {}, { product_master_id: null }).decision, 'cant_tell'));
Deno.test('no supporting evidence downgrades sure', () => assertEquals(check({}, {}, { reason: '' }).decision, 'probably'));
Deno.test('new never retains a mapped item', () => assertEquals(check({}, {}, { decision: 'new' }).product_master_id, null));
Deno.test('missing model line is cant tell', () => assertEquals(applyChecks([line], [], [candidate], ['item-a'])[0].decision, 'cant_tell'));
Deno.test('duplicate model decisions fail closed', () => assertEquals(applyChecks([line], [prediction, prediction], [candidate], ['item-a'])[0].decision, 'cant_tell'));
Deno.test('same-day evidence excluded', () => assertEquals(beforeAsOf('2026-01-02', '2026-01-02', 'past'), false));
Deno.test('future evidence excluded', () => assertEquals(beforeAsOf('2026-01-03', '2026-01-02', 'past'), false));
Deno.test('target invoice excluded even with earlier date', () => assertEquals(beforeAsOf('2026-01-01', '2026-01-02', 'target', 'target'), false));
Deno.test('earlier other invoice included', () => assertEquals(beforeAsOf('2026-01-01', '2026-01-02', 'past', 'target'), true));
Deno.test('tenant admin can run own tenant', () => assertEquals(canAdmin([{ tenant_id: 'a', role: 'tenant_admin' }], 'a'), true));
Deno.test('tenant admin cannot run other tenant', () => assertEquals(canAdmin([{ tenant_id: 'a', role: 'tenant_admin' }], 'b'), false));
Deno.test('ordinary member cannot run backtest', () => assertEquals(canAdmin([{ tenant_id: 'a', role: 'member' }], 'a'), false));
Deno.test('platform admin can run other tenant', () => assertEquals(canAdmin([{ tenant_id: 'a', role: 'platform_admin' }], 'b'), true));
Deno.test('median uses all historical prices', () => assertEquals(median([100, 500, 105, 90, 110, 95]), 102.5));
Deno.test('negative returned quantity is not a full product', () => assertEquals(kindOf('Guinness', -1), 'return'));
Deno.test('Corona in master without supplier link is probably, never new', () => {
  for (const decision of ['sure', 'probably', 'new'] as const) {
    const result = applyChecks([{ ...line, description: 'Corona Extra' }], [{ ...prediction, decision, product_master_id: 'corona' }], [], [{ id: 'corona', name: 'Corona Extra' }])[0];
    assertEquals(result.decision, 'probably');
    assertEquals(result.product_master_id, 'corona');
    assertEquals(result.reason, 'Already in Items Master, not yet linked to this supplier');
  }
});
Deno.test('tenant-only deposit never maps full product', () => assertEquals(applyChecks([line], [{ ...prediction, product_master_id: 'deposit' }], [], [{ id: 'deposit', name: 'Keg deposit' }])[0].product_master_id, null));
