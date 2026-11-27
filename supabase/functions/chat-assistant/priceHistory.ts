// Read-only purchase price history for invoice attachment analysis.
// Tenant-scoped, excludes drafts/voided, never writes.
export async function buildPriceHistory(admin: any, tenantId: string): Promise<string> {
  const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("invoice_line_items")
    .select("description, unit, unit_price, net_unit_cost, invoices!inner(invoice_date, review_status, tenant_id, suppliers(name))")
    .eq("tenant_id", tenantId)
    .eq("invoices.tenant_id", tenantId)
    .gte("invoices.invoice_date", since)
    .not("invoices.review_status", "in", "(Draft,Voided)")
    .limit(1000);
  const master = await itemsMasterPrices(admin, tenantId);
  if (error || !data?.length) return master;
  type Agg = { supplier: string; unit: string; last: number; lastDate: string; min: number; max: number; n: number };
  const items = new Map<string, Map<string, Agg>>();
  for (const r of data as any[]) {
    const price = Number(r.net_unit_cost || r.unit_price);
    const desc = String(r.description || "").trim();
    if (!desc || !(price > 0)) continue;
    const supplier = r.invoices?.suppliers?.name ?? "Unknown supplier";
    const date = r.invoices?.invoice_date ?? "";
    const key = desc.toLowerCase();
    const bySup = items.get(key) ?? new Map<string, Agg>();
    const a = bySup.get(supplier) ?? { supplier, unit: r.unit ?? "", last: price, lastDate: date, min: price, max: price, n: 0 };
    a.n++; a.min = Math.min(a.min, price); a.max = Math.max(a.max, price);
    if (date >= a.lastDate) { a.last = price; a.lastDate = date; a.unit = r.unit ?? a.unit; }
    bySup.set(supplier, a); items.set(key, bySup);
  }
  const lines: string[] = [];
  for (const [desc, bySup] of items) {
    const parts = [...bySup.values()].map((a) => `${a.supplier}: last HK$${a.last.toFixed(2)}/${a.unit || "unit"} on ${a.lastDate}, range ${a.min.toFixed(2)}–${a.max.toFixed(2)} (${a.n} buys)`);
    lines.push(`- ${desc} → ${parts.join("; ")}`);
    if (lines.length >= 200) break;
  }
  return [master, lines.length ? `Last 180 days of approved invoices (item → supplier: last price, range, buy count):\n${lines.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

/** The Items Master price agreed per supplier: what an invoice line is compared with when there is no buying history yet. */
async function itemsMasterPrices(admin: any, tenantId: string): Promise<string> {
  const { data } = await admin.from("product_suppliers")
    .select("supplier, supplier_product_name, external_sku, purchase_unit, purchase_unit_cost, product_master!inner(internal_product_name, status)")
    .eq("tenant_id", tenantId).limit(1000);
  const rows = ((data ?? []) as any[]).filter((r) => Number(r.purchase_unit_cost) > 0 && (r.product_master?.status ?? "Active") === "Active");
  if (!rows.length) return "";
  const lines = rows.slice(0, 300).map((r) => `- ${r.supplier}: "${r.supplier_product_name || r.product_master?.internal_product_name}"${r.external_sku ? ` [${r.external_sku}]` : ""} = ${r.product_master?.internal_product_name}, HK$${Number(r.purchase_unit_cost).toFixed(2)} per ${r.purchase_unit || "unit"}`);
  return `Items Master agreed prices (supplier: printed name = our item, price per bought unit). Compare each invoice line with these first:\n${lines.join("\n")}`;
}
