// Ordering in chat. The person says what they need in any words (typos, units, "same as last week");
// Bani finds each item in the Items Master with every supplier's price, deal, delivery days and what was
// bought before (find_order_items, read-only), then shows one list per supplier (show_order_lists). The
// server fills names, codes, units and prices from the database: the model only picks items, suppliers and
// quantities. Nothing is sent or saved here; the person copies a list or saves it as a PO in the app.

type Admin = any;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
const stem = (w: string) => w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

/** 0–1: how well the typed words match a product's names (typos and plurals allowed). */
export function matchScore(query: string, names: string[]): number {
  const q = norm(query).split(" ").filter(w => w.length >= 2).map(stem);
  // Each name word both as written and without a plural ending, so "frys" meets "fries" either way.
  const words = [...new Set(names.flatMap(n => norm(n).split(" ").filter(Boolean).flatMap(w => [w, stem(w)])))];
  if (!q.length || !words.length) return 0;
  const best = q.map(t => {
    let s = 0;
    for (const w of words) {
      if (w === t) { s = 1; break; }
      if (t.length >= 3 && w.length >= 3 && (w.startsWith(t) || t.startsWith(w))) s = Math.max(s, 0.85);
      const m = Math.max(t.length, w.length);
      if (m >= 3) { const r = 1 - lev(t, w) / m; if (r >= 0.6) s = Math.max(s, r * 0.9); }
    }
    return s;
  });
  return best.reduce((a, b) => a + b, 0) / best.length;
}

type Deal = { product_id: string; supplier_id: string; deal_type: string; buy_qty: number | null; free_qty: number | null; discount_percent: number | null; special_price: number | null; valid_from: string | null; valid_until: string | null };

/** Price of one purchase unit after a discount deal; buy-x-get-y keeps the list price (the free units arrive). */
export function priceAfterDeal(price: number, deal?: Deal | null): number {
  if (!deal || deal.deal_type !== "discount") return price;
  if (deal.special_price != null && Number(deal.special_price) > 0) return Number(deal.special_price);
  return Math.round(price * (1 - Math.min(100, Math.max(0, Number(deal.discount_percent) || 0)) / 100) * 100) / 100;
}
const dealText = (d?: Deal | null) => !d ? null : d.deal_type === "discount" ? (d.special_price ? `special price ${d.special_price}` : `${d.discount_percent}% off`) : `buy ${d.buy_qty} get ${d.free_qty} free`;

/** Next delivery date on or after `from` (YYYY-MM-DD, Hong Kong) for a supplier's delivery days; null when unknown. */
export function nextDelivery(days: string[] | null | undefined, from: string): string | null {
  const set = new Set((days ?? []).map(d => d.slice(0, 3).toLowerCase()));
  if (!set.size) return null;
  const start = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    if (set.has(DAYS[d.getUTCDay()].toLowerCase())) return d.toISOString().slice(0, 10);
  }
  return null;
}
const hkToday = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

async function loadCatalogue(admin: Admin, t: string) {
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const [pm, ps, sup, deals, venues, inv] = await Promise.all([
    admin.from("product_master").select("id,internal_sku,internal_product_name,supplier_product_name,supplier,external_sku,purchase_unit,purchase_unit_cost,stock_uom,stock_qty,min_stock_qty,reorder_qty,status").eq("tenant_id", t).limit(5000),
    admin.from("product_suppliers").select("product_master_id,supplier,external_sku,supplier_product_name,purchase_unit,purchase_unit_cost,stock_uom,stock_qty,status").eq("tenant_id", t).limit(10000),
    admin.from("suppliers").select("id,name,code,delivery_days,moq,phone,email,is_active,directory_merged_into").eq("tenant_id", t).limit(2000),
    admin.from("item_supplier_deals").select("product_id,supplier_id,deal_type,buy_qty,free_qty,discount_percent,special_price,valid_from,valid_until,is_active").eq("tenant_id", t).eq("is_active", true).limit(5000),
    admin.from("venues").select("id,name,is_active").eq("tenant_id", t).limit(200),
    admin.from("invoices").select("id,invoice_date,supplier_id,venue,review_status").eq("tenant_id", t).gte("invoice_date", since).limit(5000),
  ]);
  const invoices = ((inv.data ?? []) as any[]).filter(i => !["Draft", "Voided"].includes(String(i.review_status)));
  const ids = invoices.map(i => i.id);
  const lines: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("invoice_line_items").select("invoice_id,product_master_id,quantity,unit").eq("tenant_id", t).in("invoice_id", ids.slice(i, i + 200)).not("product_master_id", "is", null).limit(10000);
    lines.push(...(data ?? []));
  }
  const today = hkToday();
  const liveDeals = ((deals.data ?? []) as Deal[]).filter(d => (!d.valid_from || d.valid_from <= today) && (!d.valid_until || d.valid_until >= today));
  return { products: (pm.data ?? []) as any[], entries: (ps.data ?? []) as any[], suppliers: ((sup.data ?? []) as any[]).filter(s => s.is_active !== false && !s.directory_merged_into), deals: liveDeals, venues: ((venues.data ?? []) as any[]).filter(v => v.is_active !== false), invoices, lines, today };
}

type Cat = Awaited<ReturnType<typeof loadCatalogue>>;

/** Every supplier line for a product, with its price after any live deal, delivery days and what was bought before. */
function supplierOptions(c: Cat, p: any, venue: string | null) {
  const byName = new Map(c.suppliers.map(s => [norm(s.name), s]));
  const rows = c.entries.filter(e => e.product_master_id === p.id && e.status !== "inactive");
  if (p.supplier && !rows.some(e => norm(e.supplier) === norm(p.supplier))) rows.push({ supplier: p.supplier, external_sku: p.external_sku, supplier_product_name: p.supplier_product_name, purchase_unit: p.purchase_unit, purchase_unit_cost: p.purchase_unit_cost, stock_uom: p.stock_uom, stock_qty: p.stock_qty });
  const invById = new Map(c.invoices.map(i => [i.id, i]));
  return rows.map(e => {
    const s = byName.get(norm(e.supplier));
    const deal = s ? c.deals.find(d => d.product_id === p.id && d.supplier_id === s.id) : undefined;
    const price = Number(e.purchase_unit_cost) || 0;
    const net = priceAfterDeal(price, deal);
    const packQty = Number(e.stock_qty) || 0;
    const bought = c.lines.filter(l => l.product_master_id === p.id).map(l => ({ l, i: invById.get(l.invoice_id) })).filter(x => x.i && s && x.i.supplier_id === s.id && (!venue || norm(x.i.venue) === norm(venue)))
      .sort((a, b) => String(b.i.invoice_date).localeCompare(String(a.i.invoice_date)));
    const qtys = bought.slice(0, 5).map(x => Number(x.l.quantity) || 0).filter(q => q > 0).sort((a, b) => a - b);
    return {
      supplier_id: s?.id ?? null, supplier: s?.name ?? e.supplier, supplier_code: e.external_sku || null, supplier_item_name: e.supplier_product_name || null,
      unit: e.purchase_unit || null, list_price: price || null, price: net || null, deal: dealText(deal),
      cost_per_stock_unit: net > 0 && packQty > 0 && e.stock_uom ? { cost: Math.round(net / packQty * 100) / 100, per: e.stock_uom, pack: `${packQty} ${e.stock_uom}` } : null,
      delivery_days: s?.delivery_days ?? [], next_delivery: nextDelivery(s?.delivery_days, c.today), min_order: Number(s?.moq) || null,
      last_bought: bought[0] ? { date: bought[0].i.invoice_date, qty: Number(bought[0].l.quantity) || null, unit: bought[0].l.unit || e.purchase_unit || null } : null,
      times_bought_120d: bought.length, usual_qty: qtys.length ? qtys[Math.floor(qtys.length / 2)] : null,
    };
  });
}

function resolveVenue(c: Cat, v: unknown): { name: string | null; error?: string } {
  const names = c.venues.map(x => x.name);
  if (typeof v === "string" && v.trim()) {
    const hit = c.venues.find(x => norm(x.name) === norm(v)) ?? c.venues.find(x => matchScore(String(v), [x.name]) >= 0.7);
    return hit ? { name: hit.name } : { name: null, error: `No venue called "${v}". Venues: ${names.join(", ")}.` };
  }
  return names.length === 1 ? { name: names[0] } : { name: null };
}

export const findOrderItemsTool = { type: "function", function: {
  name: "find_order_items",
  description: "READ-ONLY. When someone wants to order stock (\"need olive 6, frys 10…\", \"same as last week\"), look up each item they named in the Items Master: candidate products with every supplier's code, name, unit, price after live deals, cost per stock unit, delivery days and next delivery date, minimum order, last bought and usual quantity. Pass items exactly as typed (typos fine). Use it again for changes or new items. Then call show_order_lists.",
  parameters: { type: "object", properties: {
    items: { type: "array", items: { type: "string" }, description: "What they asked for, one entry per item, as typed (e.g. 'frys', 'coke zero', 'lemon')" },
    venue: { type: "string", description: "Venue the order is for, if said" },
  }, required: ["items"], additionalProperties: false } } };

export async function findOrderItems(args: any, admin: Admin, t: string) {
  const c = await loadCatalogue(admin, t);
  const venue = resolveVenue(c, args?.venue);
  const items = (Array.isArray(args?.items) ? args.items : []).filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 40);
  const active = c.products.filter(p => p.status !== "inactive");
  const found = items.map((q: string) => {
    const ranked = active.map(p => ({ p, s: matchScore(q, [p.internal_product_name, p.supplier_product_name ?? "", p.internal_sku ?? "", ...c.entries.filter(e => e.product_master_id === p.id).map(e => e.supplier_product_name ?? "")]) }))
      .filter(x => x.s >= 0.55).sort((a, b) => b.s - a.s).slice(0, 4);
    return { asked: q, matches: ranked.map(({ p, s }) => ({ product_master_id: p.id, sku: p.internal_sku, name: p.internal_product_name, match: Math.round(s * 100) / 100, min_stock: Number(p.min_stock_qty) || null, reorder_qty: Number(p.reorder_qty) || null, stock_unit: p.stock_uom || null, suppliers: supplierOptions(c, p, venue.name) })) };
  });
  return { ok: true, saved: false, today: c.today, venue: venue.name, venues: c.venues.map(v => v.name), venue_note: venue.error ?? (venue.name ? null : "Several venues: ask which one only if it isn't clear from the chat."), items: found,
    note: "Work out what they meant: a clear best match needs no question; ask only about real doubts (two different products match, no quantity and no usual quantity, nothing matches). Ask all questions at once, numbered and short. Pick each supplier by the lowest price after deals (cost per stock unit when packs differ) among suppliers that can deliver by when they need it; mention a cheaper supplier that delivers later in one line. Convert their units to the supplier's unit and say so. Items not in the Items Master go on as typed. Then call show_order_lists; never write the lists as a table yourself." };
}

export const showOrderListsTool = { type: "function", function: {
  name: "show_order_lists",
  description: "Show the order as one list per supplier (after find_order_items), with Copy and Save as PO under each. Call again with the whole updated order after any change. Names, codes, units and prices are filled from the database; you give products, suppliers and quantities only.",
  parameters: { type: "object", properties: {
    venue: { type: "string" },
    lists: { type: "array", items: { type: "object", properties: {
      supplier_id: { type: "string", description: "suppliers.id from find_order_items" },
      delivery_date: { type: "string", description: "YYYY-MM-DD, optional" },
      lines: { type: "array", items: { type: "object", properties: {
        product_master_id: { type: "string", description: "From find_order_items; omit for an item not in the Items Master" },
        text: { type: "string", description: "Only for an item not in the Items Master: the item as they said it" },
        qty: { type: "number" }, unit: { type: "string", description: "Only for an item not in the Items Master" },
      }, required: ["qty"], additionalProperties: false } },
    }, required: ["supplier_id", "lines"], additionalProperties: false } },
  }, required: ["lists"], additionalProperties: false } } };

export type OrderLine = { product_master_id: string | null; code: string | null; name: string; qty: number; unit: string | null; unit_price: number | null; total: number | null; not_in_master?: boolean };
export type OrderList = { supplier_id: string; supplier: string; venue: string | null; delivery_date: string | null; delivery_days: string[]; min_order: number | null; lines: OrderLine[]; total: number; text: string };

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const qtyText = (n: number) => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

/** The message pasted to the supplier: their own codes and names. */
export function orderText(l: Pick<OrderList, "venue" | "delivery_date" | "lines">): string {
  const head = `Hi, order for ${l.venue ?? "us"}${l.delivery_date ? `, delivery ${shortDate(l.delivery_date)}` : ""}:`;
  return [head, ...l.lines.map(x => `${x.code ? `${x.code} ` : ""}${x.name} × ${qtyText(x.qty)}${x.unit ? ` ${x.unit}` : ""}`), "Thank you!"].join("\n");
}

export async function showOrderLists(args: any, admin: Admin, t: string): Promise<{ ok: boolean; error?: string; lists?: OrderList[]; summary?: string; note?: string }> {
  const c = await loadCatalogue(admin, t);
  const venue = resolveVenue(c, args?.venue);
  if (venue.error) return { ok: false, error: venue.error };
  const out: OrderList[] = [];
  for (const raw of (Array.isArray(args?.lists) ? args.lists : []).slice(0, 12)) {
    const s = c.suppliers.find(x => x.id === raw?.supplier_id);
    if (!s) return { ok: false, error: `Unknown supplier_id ${raw?.supplier_id}. Use the ids from find_order_items.` };
    const lines: OrderLine[] = [];
    for (const l of (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 60)) {
      const qty = Number(l?.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (l.product_master_id) {
        const p = c.products.find(x => x.id === l.product_master_id);
        if (!p) return { ok: false, error: `Unknown product_master_id ${l.product_master_id}.` };
        const o = supplierOptions(c, p, venue.name).find(x => x.supplier_id === s.id);
        const price = o?.price ?? null;
        lines.push({ product_master_id: p.id, code: o?.supplier_code ?? null, name: o?.supplier_item_name || p.internal_product_name, qty, unit: o?.unit ?? p.purchase_unit ?? null, unit_price: price, total: price != null ? Math.round(price * qty * 100) / 100 : null });
      } else if (typeof l.text === "string" && l.text.trim()) {
        lines.push({ product_master_id: null, code: null, name: l.text.trim().slice(0, 120), qty, unit: typeof l.unit === "string" ? l.unit.trim().slice(0, 20) : null, unit_price: null, total: null, not_in_master: true });
      }
    }
    if (!lines.length) continue;
    const date = typeof raw.delivery_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.delivery_date) ? raw.delivery_date : nextDelivery(s.delivery_days, c.today);
    const list = { supplier_id: s.id, supplier: s.name, venue: venue.name, delivery_date: date, delivery_days: s.delivery_days ?? [], min_order: Number(s.moq) || null, lines, total: Math.round(lines.reduce((n, x) => n + (x.total ?? 0), 0) * 100) / 100 };
    out.push({ ...list, text: orderText(list) });
  }
  if (!out.length) return { ok: false, error: "No lines with a quantity above 0." };
  const summary = out.map(l => `${l.supplier}: ${l.lines.map(x => `${x.name} ${qtyText(x.qty)}${x.unit ? ` ${x.unit}` : ""}`).join(", ")}`).join(" | ");
  return { ok: true, lists: out, summary, note: "The lists are shown under your reply with Copy and Save as PO. Reply in one or two short lines (what you assumed, any cheaper option or minimum order shortfall); do not repeat the lists." };
}
