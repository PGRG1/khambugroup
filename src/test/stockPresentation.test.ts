import { describe, expect, it } from 'vitest';
import { stockItemPresentation } from '@/utils/stockPresentation';
const receipts = [{ id:'g',venue:'Assembly',status:'confirmed',received_date:'2026-10-31' },{ id:'old',venue:'Assembly',status:'confirmed',received_date:'2026-10-01' },{ id:'other',venue:'Caliente',status:'confirmed',received_date:'2026-10-31' }];
const lines = [{grn_id:'g',product_master_id:'p',accepted_qty:6,quantity_received:6,unit_cost:10},{grn_id:'old',product_master_id:'p',accepted_qty:9,quantity_received:9,unit_cost:10},{grn_id:'other',product_master_id:'p',accepted_qty:100,quantity_received:100,unit_cost:10}];
describe('Stock count-aware presentation',()=>{
 it('hides On hand and Value without a count, showing only 6 delivered in the last 30 days',()=>{const r=stockItemPresentation('p',['Assembly'],[],[],receipts,lines,'2026-10-31');expect(r.qty).toBeNull();expect(r.value).toBeNull();expect(r.recentDelivered).toBe(6);});
 it('adds only scoped deliveries after the approved baseline',()=>{const r=stockItemPresentation('p',['Assembly'],[{id:'s',venue:'Assembly',count_date:'2026-10-20',status:'approved'}],[{session_id:'s',product_master_id:'p',counted_qty:2,unit_cost:10}],receipts,lines,'2026-10-31');expect(r.qty).toBe(8);expect(r.value).toBe(80);expect(r.delivered).toBe(6);});
 it('does not let one venue count imply that every venue was counted',()=>{const r=stockItemPresentation('p',['Assembly','Caliente'],[{id:'s',venue:'Assembly',count_date:'2026-10-20',status:'approved'}],[{session_id:'s',product_master_id:'p',counted_qty:2,unit_cost:10}],receipts,lines,'2026-10-31');expect(r.qty).toBeNull();expect(r.value).toBeNull();});
 it('does not treat a draft count as an approved baseline',()=>{const r=stockItemPresentation('p',['Assembly'],[{id:'s',venue:'Assembly',count_date:'2026-10-20',status:'in_progress'}],[{session_id:'s',product_master_id:'p',counted_qty:2,unit_cost:10}],receipts,lines,'2026-10-31');expect(r.qty).toBeNull();});
});
