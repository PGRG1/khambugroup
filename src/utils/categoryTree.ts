/** Categories: Bani's master list plus a client's own. Pure rules shared by Settings › Categories and the control plane. */
export type CatRow = { id: string; name: string; level: 1 | 2 | 3; parent_id: string | null; master_id?: string | null; is_active?: boolean };
export type ProductCats = { level1_category: string | null; level2_category: string | null; level3_category: string | null };

export const isOwn = (c: CatRow) => !c.master_id;

export function childrenOf(rows: CatRow[], parent: string | null, level: 1 | 2 | 3) {
  return rows.filter((r) => r.level === level && r.parent_id === parent && r.is_active !== false)
    .sort((a, b) => Number(isOwn(a)) - Number(isOwn(b)) || a.name.localeCompare(b.name));
}

/** The names a category is stored under on products (Level 1, 2, 3). */
export function pathOf(rows: CatRow[], c: CatRow): string[] {
  const out = [c.name];
  let p = c.parent_id ? rows.find((r) => r.id === c.parent_id) : undefined;
  while (p) { out.unshift(p.name); p = p.parent_id ? rows.find((r) => r.id === p!.parent_id) : undefined; }
  return out;
}

/** How many products use each category. */
export function productCounts(rows: CatRow[], products: ProductCats[]) {
  const key = (a: (string | null)[]) => a.map((x) => (x ?? "").trim().toLowerCase()).join("›");
  const n = new Map<string, number>();
  for (const p of products) {
    const l = [p.level1_category, p.level2_category, p.level3_category];
    for (let i = 1; i <= 3; i++) if ((l[i - 1] ?? "").trim()) n.set(key(l.slice(0, i)), (n.get(key(l.slice(0, i))) ?? 0) + 1);
  }
  return new Map(rows.map((r) => [r.id, n.get(key(pathOf(rows, r))) ?? 0]));
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Two names that are probably the same category: plural, spelling, or "Herbs" and "Herbs & Spices". */
export function sameCategory(a: string, b: string) {
  const x = norm(a).split(" ").map(singular), y = norm(b).split(" ").map(singular);
  const xs = x.join(" "), ys = y.join(" ");
  if (xs === ys) return true;
  if (Math.min(xs.length, ys.length) >= 6 && distance(xs, ys) <= 2) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length === 1 && long[1] === "and" && long[0] === short[0];
}

export type Tidy = { from: CatRow; into: CatRow; products: number };

/** Categories to merge: same level and parent, probably the same name. The client's own one goes into the master one. */
export function toTidy(rows: CatRow[], counts: Map<string, number>): Tidy[] {
  const out: Tidy[] = [];
  const active = rows.filter((r) => r.is_active !== false);
  for (const a of active) for (const b of active) {
    if (a.id >= b.id || a.level !== b.level || a.parent_id !== b.parent_id || !sameCategory(a.name, b.name)) continue;
    if (!isOwn(a) && !isOwn(b)) continue;
    const [from, into] = isOwn(a) !== isOwn(b) ? (isOwn(a) ? [a, b] : [b, a]) : (counts.get(a.id) ?? 0) <= (counts.get(b.id) ?? 0) ? [a, b] : [b, a];
    out.push({ from, into, products: counts.get(from.id) ?? 0 });
  }
  return out.sort((a, b) => a.from.level - b.from.level || a.from.name.localeCompare(b.from.name));
}

/** Products missing a Level 1 or Level 2. */
export function missingLevels(products: ProductCats[]) {
  return {
    noLevel1: products.filter((p) => !(p.level1_category ?? "").trim()).length,
    noLevel2: products.filter((p) => (p.level1_category ?? "").trim() && !(p.level2_category ?? "").trim()).length,
  };
}
