// Pure rules for setting up an invoice's new items in Bani chat (ChatInvoiceSetup.tsx).

export type SetupCategory = { id: string; name: string; level: 1 | 2 | 3; parent_id: string | null; master_id?: string | null; is_active?: boolean };
export type CategoryPath = { id: string; label: string; l1: string; l2: string; l3: string; group: string };

/** "Sholo Agave Syrup 5KG" → 5000 g; "Pepper 35g_R" → 35 g; "Mezcal 750ml" → 750 ml; "1.5L" → 1500 ml. */
export function parsePrintedSize(printed: string): { qty: number; unit: "g" | "ml" } | null {
  const m = printed.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gm|gr|ml|cl|l|ltr|litre|liter)(?![a-z])/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!(n > 0)) return null;
  const u = m[2].toLowerCase();
  if (u.startsWith("kg")) return { qty: Math.round(n * 1000), unit: "g" };
  if (u === "g" || u === "gm" || u === "gr") return { qty: n, unit: "g" };
  if (u === "ml") return { qty: n, unit: "ml" };
  if (u === "cl") return { qty: Math.round(n * 10), unit: "ml" };
  return { qty: Math.round(n * 1000), unit: "ml" };
}

/** Every category an item can sit in (a Level 3, or a Level 2 with nothing under it), as "L1 › L2 › L3",
 * with the group from Bani's master list for its Level 1 ('' when the Level 1 has none). Sorted by label. */
export function categoryPaths(cats: SetupCategory[], groupsByMaster: Record<string, string>): CategoryPath[] {
  const byId = new Map(cats.map(c => [c.id, c]));
  const hasChild = new Set(cats.map(c => c.parent_id).filter(Boolean) as string[]);
  const out: CategoryPath[] = [];
  for (const c of cats) {
    if (c.level === 1 || (c.level === 2 && hasChild.has(c.id))) continue;
    const l2 = c.level === 3 ? byId.get(c.parent_id ?? "") : c;
    const l1 = l2 ? byId.get(l2.parent_id ?? "") : undefined;
    if (!l2 || !l1) continue;
    const l3 = c.level === 3 ? c.name : "";
    out.push({ id: c.id, label: [l1.name, l2.name, l3].filter(Boolean).join(" › "), l1: l1.name, l2: l2.name, l3, group: (l1.master_id && groupsByMaster[l1.master_id]) || "" });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
