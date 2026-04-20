// Shared sorting utilities for data tables.
// Behavior:
//  - Plain click on a column: make it the sole sort, toggle asc <-> desc.
//    First click on a fresh column starts ascending.
//  - Shift+click: add the column to the sort chain, or toggle its direction
//    if already in the chain. Shift+click on the only chained column still
//    toggles instead of removing — sort is never silently cleared.
//  - Comparator coerces numeric-looking values and pushes empty/null values
//    to the bottom regardless of direction so blank rows do not float.

export type SortDir = "asc" | "desc";
export type SortColumn = { key: string; dir: SortDir };

export function toggleSortColumns(
  prev: SortColumn[],
  key: string,
  additive: boolean,
): SortColumn[] {
  const idx = prev.findIndex((s) => s.key === key);

  if (!additive) {
    // Single-column mode: always end with exactly this column sorted.
    if (idx === -1 || prev.length !== 1) return [{ key, dir: "asc" }];
    return [{ key, dir: prev[0].dir === "asc" ? "desc" : "asc" }];
  }

  // Additive (shift-click): keep chain, toggle dir, or append.
  if (idx === -1) return [...prev, { key, dir: "asc" }];
  return prev.map((s, i) =>
    i === idx ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s,
  );
}

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const toComparable = (v: unknown): number | string => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v ?? "");
  // Try numeric coercion for strings that are pure numbers (handles cases
  // where a column mixes numeric strings with numbers).
  if (s !== "" && !isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s.trim())) {
    return Number(s);
  }
  return s.toLowerCase();
};

export function compareRows<T>(a: T, b: T, sortColumns: SortColumn[]): number {
  for (const { key, dir } of sortColumns) {
    const av = (a as any)[key];
    const bv = (b as any)[key];
    const aBlank = isBlank(av);
    const bBlank = isBlank(bv);
    // Blanks always sort to the bottom, regardless of direction.
    if (aBlank && bBlank) continue;
    if (aBlank) return 1;
    if (bBlank) return -1;

    const ac = toComparable(av);
    const bc = toComparable(bv);
    let cmp = 0;
    if (typeof ac === "number" && typeof bc === "number") cmp = ac - bc;
    else cmp = String(ac).localeCompare(String(bc), undefined, { numeric: true });
    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  }
  return 0;
}

export function sortRows<T>(rows: T[], sortColumns: SortColumn[]): T[] {
  if (sortColumns.length === 0) return rows;
  return [...rows].sort((a, b) => compareRows(a, b, sortColumns));
}
