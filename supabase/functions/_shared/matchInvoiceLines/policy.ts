export type Decision = 'sure' | 'probably' | 'cant_tell' | 'new' | 'not_a_product';
export type Line = { line_index: number; description: string; item_code: string | null; unit: string | null; quantity: number; unit_price: number; amount: number };
export type Candidate = { id: string; name: string; kind: string; units: string[]; prices: { date: string; price: number }[]; median_price: number | null; descriptions: string[]; codes: string[]; times_bought: number; last_bought: string | null; pack: string | null };
export type ItemDraft = { name: string; category: string | null; purchase_unit: string | null; stock_unit: string | null; units_per_purchase_unit: number | null; unit_price: number | null; supplier_code: string | null };
export type MasterItem = { id: string; name: string };
export type Prediction = { line_index: number; decision: Decision; product_master_id: string | null; alternatives: string[]; reason: string; draft?: ItemDraft | null };

export const normalizeUnit = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const supplierKey = (s: string) => s.toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
export function kindOf(description: string, quantity?: number): string {
  const text = description.trim().toLowerCase();
  if (!text) return 'empty';
  if (/\b(deposit|empt(?:y|ies)|keg refund|bottle refund)\b|按金|押金|空桶|空瓶/.test(text)) return 'deposit';
  if ((quantity !== undefined && quantity < 0) || /\b(return(?:ed)?|refund|credit note)\b|退貨|退货/.test(text)) return 'return';
  return 'product';
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function beforeAsOf(date: string, asOf: string, invoiceId: string, excluded?: string): boolean {
  return date < asOf && invoiceId !== excluded;
}
export function canAdmin(roles: { tenant_id: string; role: string }[], tenantId: string): boolean {
  return roles.some(r => ['platform_admin', 'super_admin'].includes(r.role) || (r.tenant_id === tenantId && r.role === 'tenant_admin'));
}
export function applyChecks(lines: Line[], raw: Prediction[], candidates: Candidate[], masters: (string | MasterItem)[]): Prediction[] {
  const byId = new Map(candidates.map(c => [c.id, c]));
  const masterById = new Map(masters.map(m => typeof m === "string" ? [m, { id: m, name: "" }] : [m.id, m]));
  const sentIds = new Set([...masterById.keys(), ...byId.keys()]);
  const itemKind = (id: string) => byId.get(id)?.kind ?? (masterById.get(id)?.name ? kindOf(masterById.get(id)?.name || "") : undefined);
  const result = lines.map(line => {
    const matches = raw.filter(p => p.line_index === line.line_index);
    const p: Prediction = matches.length === 1 ? { ...matches[0], alternatives: [...matches[0].alternatives] } : { line_index: line.line_index, decision: 'cant_tell', product_master_id: null, alternatives: [], reason: 'No unambiguous model decision was returned.' };
    const failed: string[] = [];
    const lineKind = kindOf(line.description, line.quantity);
    p.alternatives = [...new Set(p.alternatives)].filter(id => sentIds.has(id) && id !== p.product_master_id && itemKind(id) === lineKind).slice(0, 3);
    if (p.decision === 'new' && p.product_master_id && masterById.has(p.product_master_id) && !byId.has(p.product_master_id)) p.decision = 'probably';
    if (!['sure', 'probably'].includes(p.decision)) p.product_master_id = null;
    if (p.product_master_id && !sentIds.has(p.product_master_id)) {
      p.product_master_id = null; p.decision = 'cant_tell'; failed.push('Item was not sent to the model');
    }
    const candidate = p.product_master_id ? byId.get(p.product_master_id) : undefined;
    if (p.product_master_id && itemKind(p.product_master_id) !== lineKind) {
      p.product_master_id = null; p.decision = 'cant_tell'; failed.push('Empty, return or deposit type conflicts with the item');
    }
    if (p.product_master_id && !candidate) { p.decision = 'probably'; p.reason = 'Already in Items Master, not yet linked to this supplier'; }
    if (['sure', 'probably'].includes(p.decision) && !p.product_master_id) {
      p.decision = 'cant_tell'; failed.push('No valid item confidence');
    }
    if (p.decision === 'sure' && candidate) {
      if (!p.reason.trim()) failed.push('No supporting evidence');
      if (!line.unit || !candidate.units.length || !candidate.units.some(u => normalizeUnit(u) === normalizeUnit(line.unit))) failed.push('Unit is not consistent with known item units');
      if (candidate.median_price !== null && Math.abs(line.unit_price - candidate.median_price) > Math.abs(candidate.median_price) * .25 + 1e-9) failed.push('Unit price differs by more than 25% from median past price');
      if (Math.abs(line.quantity * line.unit_price - line.amount) > 1 + 1e-9) failed.push('Quantity × unit price differs from amount by more than 1');
      if (failed.length) p.decision = 'probably';
    }
    if (failed.length) p.reason = [p.reason.trim(), failed.join('; ')].filter(Boolean).join(' — ');
    p.reason = p.reason || 'No supporting evidence was supplied.';
    if (p.decision !== "new") p.draft = null;
    return p;
  });
  const counts = new Map<string, number>();
  for (const p of result) if (p.product_master_id) counts.set(p.product_master_id, (counts.get(p.product_master_id) ?? 0) + 1);
  for (const p of result) if (p.product_master_id && (counts.get(p.product_master_id) ?? 0) > 1) {
    p.decision = 'probably'; p.reason += ' — Same item assigned to multiple invoice lines';
  }
  return result;
}