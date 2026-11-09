// Read-only dish cost/margin lookup. Costs come from saved recipes (theoretical_cost follows the latest confirmed purchase price). Never writes.
export const menuMarginsTool = { type: 'function', function: { name: 'get_menu_margins', description: 'READ-ONLY menu dish costs, selling prices, gross profit and food cost % from saved recipes (ingredient costs follow the latest confirmed invoice/delivery price). Use for margin questions, worst/best dishes, or planning purchasing against margins. Show a markdown table and render_chart when useful. Saves nothing.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Optional dish/category text' } }, additionalProperties: false } } };

export async function menuMargins(args: any, admin: any, t: string) {
  const [items, prices] = await Promise.all([
    admin.from('menu_items').select('id,name,category,theoretical_cost,status').eq('tenant_id', t).limit(1000),
    admin.from('menu_item_pricing').select('menu_item_id,price_type,selling_price').eq('tenant_id', t).limit(5000),
  ]);
  if (items.error || prices.error) return { ok: false, error: (items.error ?? prices.error).message };
  const term = String(args?.search ?? '').toLowerCase();
  const dishes = (items.data ?? []).filter((m: any) => !term || `${m.name} ${m.category}`.toLowerCase().includes(term)).map((m: any) => {
    const ps = (prices.data ?? []).filter((p: any) => p.menu_item_id === m.id);
    const reg = ps.find((p: any) => String(p.price_type).toLowerCase().includes('regular')) ?? ps[0];
    const price = reg ? Number(reg.selling_price) : null, cost = Number(m.theoretical_cost) || 0;
    return { dish: m.name, category: m.category || null, cost: Math.round(cost * 100) / 100, price, gross_profit: price != null ? Math.round((price - cost) * 100) / 100 : null, food_cost_pct: price ? Math.round(cost / price * 1000) / 10 : null };
  }).sort((a: any, b: any) => (b.food_cost_pct ?? -1) - (a.food_cost_pct ?? -1));
  return { ok: true, saved: false, count: dishes.length, dishes: dishes.slice(0, 60), above_35_pct: dishes.filter((d: any) => (d.food_cost_pct ?? 0) > 35).length, note: dishes.length ? 'Costs follow the latest confirmed purchase price per ingredient.' : 'No recipes saved yet. Suggest Purchasing → Menu costs → Upload menu so Bani drafts recipes priced from invoices.' };
}
