/**
 * Single canonical UOM normalization source.
 *
 * Every UOM shown, saved or migrated in the portal resolves through this map, so free-text
 * and legacy variants ("each", "BOT", "KG", "Litre", "CTN") converge on one canonical code
 * per UOM kind. Purchase UOM and Stock UOM stay semantically independent: normalization only
 * standardises the *spelling* of a unit, never forces the two fields to be equal.
 *
 * Historical invoice line text (invoice_line_items.unit) is deliberately NOT normalized —
 * it is scanned evidence and must stay readable exactly as printed.
 */

export type UomKind = "base" | "stock" | "purchase";

interface CanonicalUomDef {
  /** Canonical code for recipe/base usage (lowercase symbols). */
  base?: string;
  /** Canonical code for stock + purchase usage (capitalised words). */
  pack?: string;
  label: string;
  aliases: string[];
}

const CANONICAL: CanonicalUomDef[] = [
  { base: "g", label: "Grams", aliases: ["g", "gr", "gm", "gms", "gram", "grams"] },
  { base: "kg", pack: "kg", label: "Kilograms", aliases: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"] },
  { base: "mg", label: "Milligrams", aliases: ["mg", "milligram", "milligrams"] },
  { base: "ml", label: "Millilitres", aliases: ["ml", "mls", "millilitre", "millilitres", "milliliter", "milliliters"] },
  { base: "L", pack: "L", label: "Litres", aliases: ["l", "ltr", "ltrs", "litre", "litres", "liter", "liters"] },
  { base: "cl", label: "Centilitres", aliases: ["cl", "centilitre", "centilitres"] },
  { base: "ea", pack: "Each", label: "Each", aliases: ["ea", "each", "eaches", "unit", "units", "uom"] },
  { base: "pc", pack: "Piece", label: "Piece", aliases: ["pc", "pcs", "piece", "pieces"] },
  { pack: "Bot", label: "Bottle", aliases: ["bot", "bots", "btl", "btls", "bottle", "bottles"] },
  { pack: "Can", label: "Can", aliases: ["can", "cans"] },
  { pack: "Case", label: "Case", aliases: ["case", "cases", "cs"] },
  { pack: "Carton", label: "Carton", aliases: ["carton", "cartons", "ctn", "ctns"] },
  { pack: "Pack", label: "Pack", aliases: ["pack", "packs", "pk", "pkt", "pkts", "packet", "packets"] },
  { pack: "Bag", label: "Bag", aliases: ["bag", "bags"] },
  { pack: "Box", label: "Box", aliases: ["box", "boxes"] },
  { pack: "Jar", label: "Jar", aliases: ["jar", "jars"] },
  { pack: "Tin", label: "Tin", aliases: ["tin", "tins"] },
  { pack: "Tray", label: "Tray", aliases: ["tray", "trays"] },
  { pack: "Bunch", label: "Bunch", aliases: ["bunch", "bunches"] },
  { pack: "Loaf", label: "Loaf", aliases: ["loaf", "loaves"] },
  { pack: "Roll", label: "Roll", aliases: ["roll", "rolls"] },
  { pack: "Pouch", label: "Pouch", aliases: ["pouch", "pouches"] },
  { pack: "Keg", label: "Keg", aliases: ["keg", "kegs"] },
  { pack: "Crate", label: "Crate", aliases: ["crate", "crates"] },
  { pack: "Drum", label: "Drum", aliases: ["drum", "drums"] },
  { pack: "Sack", label: "Sack", aliases: ["sack", "sacks"] },
  { pack: "Pallet", label: "Pallet", aliases: ["pallet", "pallets"] },
  { pack: "Bucket", label: "Bucket", aliases: ["bucket", "buckets"] },
  { pack: "Block", label: "Block", aliases: ["block", "blocks"] },
];

const aliasKey = (value: string) => (value || "").trim().toLowerCase().replace(/[\s._-]+/g, "");

const ALIAS_INDEX = new Map<string, CanonicalUomDef>();
for (const def of CANONICAL) {
  for (const alias of def.aliases) ALIAS_INDEX.set(aliasKey(alias), def);
  if (def.base) ALIAS_INDEX.set(aliasKey(def.base), def);
  if (def.pack) ALIAS_INDEX.set(aliasKey(def.pack), def);
}

const codeForKind = (def: CanonicalUomDef, kind: UomKind) => (kind === "base" ? def.base : def.pack);

/**
 * Canonical code for a raw UOM value, or `null` when the value has no unambiguous
 * canonical equivalent for that kind (leave such values for manual setup — never guess).
 */
export function canonicalUom(value: string | null | undefined, kind: UomKind): string | null {
  const key = aliasKey(value || "");
  if (!key) return null;
  const def = ALIAS_INDEX.get(key);
  if (!def) return null;
  return codeForKind(def, kind) ?? null;
}

/** Canonical label for a raw value, falling back to the raw text when unknown. */
export function canonicalUomLabel(value: string | null | undefined, kind: UomKind): string {
  const key = aliasKey(value || "");
  const def = key ? ALIAS_INDEX.get(key) : undefined;
  if (def && codeForKind(def, kind)) return def.label;
  return (value || "").trim();
}

/**
 * Normalize a stored value for display/selection. Unknown values are returned untouched so
 * existing records stay readable; only known aliases are rewritten to their canonical code.
 */
export function normalizeUom(value: string | null | undefined, kind: UomKind): string {
  return canonicalUom(value, kind) ?? (value || "").trim();
}

/** True when the value is a spelling variant of a canonical code (i.e. a legacy duplicate). */
export function isLegacyUomVariant(value: string | null | undefined, kind: UomKind): boolean {
  const raw = (value || "").trim();
  if (!raw) return false;
  const canonical = canonicalUom(raw, kind);
  return canonical != null && canonical !== raw;
}

/** True when a canonical option already exists for the value (blocks duplicate free-text UOMs). */
export function hasCanonicalEquivalent(value: string | null | undefined, kind: UomKind): boolean {
  return canonicalUom(value, kind) != null;
}

/** All canonical codes for a kind — used by data migrations and setup checks. */
export function canonicalUomCodes(kind: UomKind): { code: string; label: string }[] {
  return CANONICAL.map((def) => ({ code: codeForKind(def, kind), label: def.label }))
    .filter((o): o is { code: string; label: string } => !!o.code);
}

/**
 * Values that need manual setup: non-empty, not canonical, and no alias match.
 * Reported instead of guessed or deleted.
 */
export function findAmbiguousUomValues(values: (string | null | undefined)[], kind: UomKind): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const raw = (v || "").trim();
    if (!raw) continue;
    if (canonicalUom(raw, kind) == null) out.add(raw);
  }
  return Array.from(out);
}
