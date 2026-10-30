import { describe, expect, it } from "vitest";
import { buildRegisterItems, filterRegisterLines, type PurchaseRegisterLine } from "@/utils/purchaseRegister";
const line = (patch: Partial<PurchaseRegisterLine> = {}): PurchaseRegisterLine => ({
  id:"1",invoice_id:"inv",invoice_number:"123",invoice_date:"2026-09-30",venue:"Caliente",supplier_name:"Supplier",
  description:"Hoegaarden",quantity:1,unit:"keg",unit_price:717,total:717,product_id:"hoegaarden",master_name:"Hoegaarden 20L Keg",internal_sku:"",external_sku:"",file_url:"",...patch,
});
describe("Purchase Register rules", () => {
  it("includes only the invoice venues selected portal-wide", () => {
    expect(filterRegisterLines([line(),line({id:"2",venue:"Assembly"})],{includesVenue:name=>name==="Assembly"}).map(row=>row.id)).toEqual(["2"]);
  });
  it("includes the final day of September, excluding October", () => {
    expect(filterRegisterLines([line(),line({id:"2",invoice_date:"2026-10-01"})],{from:"2026-09-01",to:"2026-09-30",includesVenue:()=>true}).map(row=>row.id)).toEqual(["1"]);
  });
  it("calculates six Hoegaarden kegs costing 4302 at 717 per keg", () => {
    const item=buildRegisterItems([line({quantity:6,total:4302})],[],"2026-09-01")[0];
    expect(item.quantity).toBe(6); expect(item.spent).toBe(4302); expect(item.overallPrice).toBe(717);
  });
  it("uses the median only within the 90 days before the period", () => {
    const history=[line({invoice_date:"2026-06-03",unit_price:600}),line({invoice_date:"2026-08-31",unit_price:800}),line({invoice_date:"2026-06-02",unit_price:10}),line({unit_price:20})];
    expect(buildRegisterItems([line()],history,"2026-09-01")[0].usualPrice).toBe(700);
  });
  it("includes two free units in overall cost while preserving the paid price", () => {
    const item=buildRegisterItems([line({quantity:4,unit_price:100,total:400}),line({id:"free",quantity:2,unit_price:0,total:0})],[],"2026-09-01")[0];
    expect(item.freeQuantity).toBe(2); expect(item.quantity).toBe(6); expect(item.paidPrice).toBe(100); expect(item.overallPrice).toBeCloseTo(400/6);
  });
  it("returns no usual price without earlier evidence", () => { expect(buildRegisterItems([line()],[],"2026-09-01")[0].usualPrice).toBeNull(); });
  it("keeps different invoice units separate", () => { expect(buildRegisterItems([line(),line({unit:"bottle"})],[],"2026-09-01")).toHaveLength(2); });
  it("keeps unlinked lines available for the explicit exception filter", () => { expect(filterRegisterLines([line(),line({id:"free",product_id:null})],{notLinked:true,includesVenue:()=>true}).map(row=>row.id)).toEqual(["free"]); });
});