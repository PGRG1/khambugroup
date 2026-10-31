export interface FoodSale { venue: string; date: string; subtotal: number }
export interface FoodReceipt { id: string; venue: string; status: string; received_date: string }
export interface FoodLine { id?: string; grn_id: string; product_master_id: string | null; accepted_qty: number | null; quantity_received: number; unit_cost: number; unit?: string; created_at?: string }
export interface CostProduct { id: string; financial_treatment?: string | null; unit?: string; purchase_unit?: string; stock_uom?: string; stock_qty?: number; base_unit_type?: string; base_unit_qty?: number; cost_per_base_unit?: number; supplier?: string }
export interface CostCount { id: string; venue: string; count_date: string; status: string; created_at?: string }
export interface CostCountLine { session_id: string; product_master_id: string; counted_qty: number | null; unit_cost: number }
export function foodCostPercent(cost: number, price: number): number | null { return price > 0 ? cost / price * 100 : null; }
export function aboveCostTarget(cost: number, price: number) { return (foodCostPercent(cost, price) ?? 0) > 35; }
export function buildFoodCosts(venues: string[], sales: FoodSale[], receipts: FoodReceipt[], lines: FoodLine[], products: CostProduct[], counts: CostCount[], countLines: CostCountLine[], from: string, to: string, today: string) {
 const end = to < today ? to : today;
 const days = end < from ? 0 : Math.round((Date.parse(end) - Date.parse(from)) / 86400000) + 1;
 const asset = new Set(products.filter(p => p.financial_treatment?.startsWith('Asset')).map(p => p.id));
 return venues.map(venue => {
  const records = sales.filter(s => s.venue === venue && s.date >= from && s.date <= end);
  const totalSales = records.reduce((s, r) => s + Number(r.subtotal), 0);
  const received = new Set(receipts.filter(r => r.venue === venue && ['confirmed', 'disputed'].includes(r.status) && r.received_date >= from && r.received_date <= end).map(r => r.id));
  const bought = lines.filter(l => received.has(l.grn_id) && !asset.has(l.product_master_id ?? '')).reduce((s,l) => s + Number(l.accepted_qty ?? l.quantity_received) * Number(l.unit_cost), 0);
  const approved = counts.filter(c => c.venue === venue && c.status === 'approved' && c.count_date >= from && c.count_date <= end).sort((a,b) => a.count_date.localeCompare(b.count_date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const opening = approved[0], closing = approved[approved.length - 1];
  const value = (id: string) => { const items = countLines.filter(l => l.session_id === id && !asset.has(l.product_master_id)); return items.length && items.every(l => l.counted_qty != null) ? items.reduce((s,l) => s + Number(l.counted_qty) * Number(l.unit_cost), 0) : null; };
  const openingValue = opening ? value(opening.id) : null, closingValue = closing ? value(closing.id) : null;
  const fromCounts = !!opening && !!closing && opening.count_date < closing.count_date && openingValue != null && closingValue != null;
  const cost = fromCounts ? Number(openingValue) + bought - Number(closingValue) : bought;
  const salesDays = new Set(records.map(r => r.date)).size;
  return { venue, sales: totalSales, bought, cost, percent: foodCostPercent(cost,totalSales), fromCounts, salesDays, days, incomplete: salesDays < days, openingDate: fromCounts ? opening?.count_date : undefined, closingDate: fromCounts ? closing?.count_date : undefined };
 });
}
const unitKey = (unit = '') => unit.trim().toLowerCase();
function measure(unit: string): {kind:string; factor:number} | null {
 const u=unitKey(unit);
 if(['g','gm','gms','gram','grams'].includes(u)) return {kind:'weight',factor:1};
 if(['kg','kgs','kilogram','kilograms'].includes(u)) return {kind:'weight',factor:1000};
 if(['ml','mls'].includes(u)) return {kind:'volume',factor:1};
 if(['l','lt','ltr','ltrs','litre','liter'].includes(u)) return {kind:'volume',factor:1000};
 if(['each','ea','pcs','pc','ea/pcs','piece','pieces'].includes(u)) return {kind:'each',factor:1};
 return null;
}
export function recipeUnitCost(product: CostProduct, latest?: Pick<FoodLine,'unit_cost'|'unit'>, recipeUnit = product.base_unit_type ?? ''): number | null {
 let baseCost = Number(product.cost_per_base_unit ?? 0);
 if (latest) {
  const receivedUnit=unitKey(latest.unit), base=unitKey(product.base_unit_type), purchase=unitKey(product.purchase_unit || product.unit), stock=unitKey(product.stock_uom);
  const baseQty=Number(product.base_unit_qty), stockQty=Number(product.stock_qty);
  if(receivedUnit === base && base) baseCost=Number(latest.unit_cost);
  else if(receivedUnit === purchase && purchase && baseQty>0) baseCost=Number(latest.unit_cost)/baseQty;
  else if(receivedUnit === stock && stock && baseQty>0 && stockQty>0) baseCost=Number(latest.unit_cost)*stockQty/baseQty;
  else { const a=measure(latest.unit ?? ''), b=measure(product.base_unit_type ?? ''); if(a && b && a.kind===b.kind) baseCost=Number(latest.unit_cost)*b.factor/a.factor; }
 }
 if(unitKey(recipeUnit)===unitKey(product.base_unit_type)) return baseCost;
 const a=measure(recipeUnit), b=measure(product.base_unit_type ?? '');
 return a && b && a.kind===b.kind ? baseCost*a.factor/b.factor : null;
}
export function latestConfirmedCosts(receipts: FoodReceipt[], lines: FoodLine[], today: string) {
 const dates=new Map(receipts.filter(r=>r.status==='confirmed'&&r.received_date<=today).map(r=>[r.id,r.received_date]));
 const ordered=lines.filter(l=>l.product_master_id&&dates.has(l.grn_id)&&Number(l.accepted_qty??l.quantity_received)>0).sort((a,b)=>(dates.get(b.grn_id)??'').localeCompare(dates.get(a.grn_id)??'')||(b.created_at??'').localeCompare(a.created_at??'')||(b.id??'').localeCompare(a.id??''));
 const result=new Map<string,FoodLine>();for(const l of ordered) if(l.product_master_id&&!result.has(l.product_master_id))result.set(l.product_master_id,l);return result;
}
