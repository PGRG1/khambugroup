/**
 * Returned / empty keg deposit lines.
 *
 * These lines are deterministically re-coded by the parse-invoice function.
 * They must only ever match a dedicated empty-deposit product — never the
 * filled, stock-bearing keg product.
 */

export const KURONAMA_FILLED_CODE = "ABAKBKZJ";
/** Dedicated canonical code for the returned Kuronama EMPTY deposit. */
export const KURONAMA_EMPTY_CODE = "ABAKBKZJ-EMPTY";

export const RETURNED_KEG_CODES = [
  "ABADEK",
  "ABADE2",
  "ABASEK",
  "ABPNEK",
  KURONAMA_EMPTY_CODE,
] as const;

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();

export interface KegLineLike {
  quantity?: number | string | null;
  item_code?: string | null;
  description?: string | null;
  scanned_item_code?: string | null;
  scanned_description?: string | null;
}

/** True when the line is a deterministically recognised returned/empty keg. */
export function isReturnedKegLine(line: KegLineLike): boolean {
  const qty = typeof line.quantity === "string" ? parseFloat(line.quantity) : Number(line.quantity ?? 0);
  if (!Number.isFinite(qty) || qty >= 0) return false;
  const code = norm(line.item_code);
  if ((RETURNED_KEG_CODES as readonly string[]).includes(code)) return true;
  return /\(empty\)\s*dep/i.test(String(line.description ?? ""));
}

/**
 * Identity used for product lookup. Returned kegs use the canonical mapped
 * item_code; every other line keeps the immutable scanned evidence.
 */
export function getMatchIdentity(line: KegLineLike): { itemCode: string; description: string } {
  if (isReturnedKegLine(line)) {
    return {
      itemCode: line.item_code || "",
      description: line.description || line.scanned_description || "",
    };
  }
  return {
    itemCode: line.scanned_item_code || line.item_code || "",
    description: line.scanned_description || line.description || "",
  };
}

export interface KegProductLike {
  external_sku?: string | null;
  internal_sku?: string | null;
}

/**
 * Strict lookup for a returned keg line: the product must carry the exact
 * canonical empty-deposit code. Returns null when unavailable so the line stays
 * unmatched instead of falling back to the filled stock product.
 */
export function resolveReturnedKegEntry<T extends KegProductLike>(
  line: KegLineLike,
  products: T[] | undefined | null,
): T | null {
  const canonical = norm(line.item_code);
  if (!canonical || !products?.length) return null;
  if (canonical === KURONAMA_FILLED_CODE) return null; // never the filled keg
  const splitSkus = (v: unknown) => norm(v).split("|").map((s) => s.trim()).filter(Boolean);
  return (
    products.find(
      (p) => splitSkus(p.external_sku).includes(canonical) || norm(p.internal_sku) === canonical,
    ) ?? null
  );
}
