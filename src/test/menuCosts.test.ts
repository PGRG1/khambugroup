import {describe,it,expect} from 'vitest';
import {buildFoodCosts,recipeUnitCost,latestConfirmedCosts,aboveCostTarget} from '@/utils/menuCosts';
const receipts=[{id:'r',venue:'A',status:'confirmed',received_date:'2026-10-15'}];
const line={grn_id:'r',product_master_id:'p',accepted_qty:2,quantity_received:5,unit_cost:10};
const calc=(sales=[{venue:'A',date:'2026-10-15',subtotal:100}],lines=[line],counts:any[]=[],countLines:any[]=[])=>buildFoodCosts(['A'],sales,receipts,lines,[{id:'p'},{id:'asset',financial_treatment:'Asset - Supplier Deposit'}],counts,countLines,'2026-10-01','2026-10-31','2026-10-20')[0];
describe('Food cost rules',()=>{
 it('uses subtotal and accepted received qty, not invoiced quantity',()=>{expect(calc().bought).toBe(20);expect(calc().percent).toBe(20);});
 it('excludes Asset products',()=>{expect(calc(undefined,[{...line,product_master_id:'asset'}]).bought).toBe(0);});
 it('includes disputed goods but not draft goods',()=>{const r=buildFoodCosts(['A'],[],[{...receipts[0],status:'disputed'},{...receipts[0],id:'draft',status:'draft'}],[line,{...line,grn_id:'draft'}],[],[],[],'2026-10-01','2026-10-31','2026-10-31');expect(r[0].bought).toBe(20);});
 it('uses opening value plus bought minus closing value',()=>{const c=calc(undefined,undefined,[{id:'open',venue:'A',status:'approved',count_date:'2026-10-01'},{id:'close',venue:'A',status:'approved',count_date:'2026-10-20'}],[{session_id:'open',product_master_id:'p',counted_qty:5,unit_cost:10},{session_id:'close',product_master_id:'p',counted_qty:3,unit_cost:10}]);expect(c.cost).toBe(40);expect(c.percent).toBe(40);expect(c.fromCounts).toBe(true);});
 it('one count never supplies both opening and closing',()=>{expect(calc(undefined,undefined,[{id:'x',venue:'A',status:'approved',count_date:'2026-10-01'}],[{session_id:'x',product_master_id:'p',counted_qty:2,unit_cost:10}]).fromCounts).toBe(false);});
 it('sales coverage counts distinct days and caps at today',()=>{const c=calc([{venue:'A',date:'2026-10-15',subtotal:50},{venue:'A',date:'2026-10-15',subtotal:50}]);expect(c.salesDays).toBe(1);expect(c.days).toBe(20);expect(c.incomplete).toBe(true);});
 it('no sales yields unknown percent',()=>expect(calc([]).percent).toBeNull());
 it('isolates venue and received period',()=>expect(buildFoodCosts(['B'],[],receipts,[line],[],[],[],'2026-10-01','2026-10-31','2026-10-31')[0].bought).toBe(0));
});
describe('Recipe rules',()=>{
 const p={id:'p',purchase_unit:'kg',stock_uom:'kg',stock_qty:1,base_unit_type:'g',base_unit_qty:1000,cost_per_base_unit:.1};
 it('normalizes latest purchase to recipe units',()=>expect(recipeUnitCost(p,{unit:'kg',unit_cost:60},'g')).toBe(.06));
 it('falls back to product cost without a receipt',()=>expect(recipeUnitCost(p)).toBe(.1));
 it('converts edited amounts between compatible units',()=>expect(recipeUnitCost(p,{unit:'kg',unit_cost:60},'kg')).toBe(60));
 it('does not guess incompatible recipe units',()=>expect(recipeUnitCost(p,undefined,'ml')).toBeNull());
 it('warns strictly above 35 percent',()=>{expect(aboveCostTarget(35,100)).toBe(false);expect(aboveCostTarget(35.01,100)).toBe(true);});
 it('uses newest confirmed receipt, not disputed or future',()=>{const r=[...receipts,{...receipts[0],id:'new',received_date:'2026-10-19'},{...receipts[0],id:'disputed',status:'disputed',received_date:'2026-10-20'}];expect(latestConfirmedCosts(r,[line,{...line,grn_id:'new',unit_cost:15},{...line,grn_id:'disputed',unit_cost:30}],'2026-10-20').get('p')?.unit_cost).toBe(15);});
});
