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
  if (error || !data?.length) return "";
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
  return lines.join("\n");
}
