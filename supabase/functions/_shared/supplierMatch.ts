/**
 * Supplier-aware Product Master matching.
 *
 * Pure, dependency-free logic shared by the parse-invoice edge function and the
 * unit tests. It evaluates ALL available evidence before classifying a line:
 *   1. exact same-supplier external SKU
 *   2. exact normalized supplier / internal product name
 *   3. pack-size, qualifier and UOM contradictions
 *   4. ambiguity (several distinct same-supplier products with the same name)
 *
 * Rules that must never be relaxed:
 *  - The selected supplier's rows are the only rows that may approve a match.
 *  - A genuine contradiction (printed SKU already registered to a DIFFERENT
 *    same-supplier product, or size / qualifier / UOM conflict) is a hard
 *    conflict and stays in manual review.
 *  - Missing evidence (a printed supplier code that Product Master does not know
 *    yet) is NOT a contradiction: it produces a non-blocking warning.
 */

export interface SupplierMatchRow {
  internal_sku: string;
  external_sku?: string | null;
  supplier?: string | null;
  supplier_product_name?: string | null;
  internal_product_name?: string | null;
  pack_size?: string | null;
  purchase_unit?: string | null;
  stock_uom?: string | null;
  [key: string]: unknown;
}

export interface SupplierMatchLine {
  item_code?: string | null;
  scanned_item_code?: string | null;
  description?: string | null;
  scanned_description?: string | null;
  pack_size?: string | null;
  unit?: string | null;
}

export type SupplierMatchStatus = "matched" | "possible_match" | "needs_review" | "unmatched";

export interface SupplierMatchResult {
  status: SupplierMatchStatus;
  row: SupplierMatchRow | null;
  reason: string;
  /** Non-blocking notes (e.g. supplier code not recorded yet). */
  warnings: string[];
  /** True only for contradictory evidence, never for missing evidence. */
  hardConflict: boolean;
  /** Internal SKUs of the same-supplier candidates considered. */
  candidates: string[];
}

export const normalizeMatchText = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\b(limited|ltd|co|company|inc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeMatchSku = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

export const supplierMatches = (a?: unknown, b?: unknown): boolean => {
  const na = normalizeMatchText(a);
  const nb = normalizeMatchText(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
};

export const externalSkuSegments = (value: unknown): string[] =>
  normalizeMatchSku(value)
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

const meaningfulNameTokens = (value: unknown): string[] =>
  normalizeMatchText(value)
    .split(" ")
    .filter((t) => t.length > 2 && !/^\d/.test(t) && !["the", "and", "with", "bottle", "pack", "case"].includes(t));

/** Loose name compatibility (used with an exact SKU hit). */
export const namesAgree = (description: unknown, row: SupplierMatchRow | null | undefined): boolean => {
  const desc = normalizeMatchText(description);
  if (!desc) return true;
  return [row?.supplier_product_name, row?.internal_product_name].some((candidate) => {
    const name = normalizeMatchText(candidate);
    if (!name) return false;
    if (name === desc || name.includes(desc) || desc.includes(name)) return true;
    const left = new Set(meaningfulNameTokens(desc));
    const right = new Set(meaningfulNameTokens(name));
    if (!left.size || !right.size) return false;
    let shared = 0;
    left.forEach((token) => { if (right.has(token)) shared += 1; });
    return shared / Math.min(left.size, right.size) >= 0.6;
  });
};

/** Exact name equality after normalization (case / punctuation insensitive). */
export const namesExactlyEqual = (description: unknown, row: SupplierMatchRow | null | undefined): boolean => {
  const desc = normalizeMatchText(description);
  if (!desc) return false;
  return [row?.supplier_product_name, row?.internal_product_name]
    .some((candidate) => !!normalizeMatchText(candidate) && normalizeMatchText(candidate) === desc);
};

const SIZE_RE = /(\d+(?:\.\d+)?)\s*(ml|cl|l|ltr|litre|liter|g|kg|gr|gram|grams|oz|cc)\b/g;

export const sizeTokens = (value: unknown): string[] => {
  const text = String(value ?? "").toLowerCase();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  SIZE_RE.lastIndex = 0;
  while ((m = SIZE_RE.exec(text)) !== null) {
    let qty = parseFloat(m[1]);
    let unit = m[2];
    if (unit === "l" || unit === "ltr" || unit === "litre" || unit === "liter") { qty *= 1000; unit = "ml"; }
    else if (unit === "cl") { qty *= 10; unit = "ml"; }
    else if (unit === "cc") { unit = "ml"; }
    else if (unit === "kg") { qty *= 1000; unit = "g"; }
    else if (unit === "gr" || unit === "gram" || unit === "grams") { unit = "g"; }
    out.push(`${qty}${unit}`);
  }
  return Array.from(new Set(out));
};

const QUALIFIERS = ["empty", "return", "returned", "deposit", "refund"];
const VARIANTS = ["non alcoholic", "alcohol free", "zero", "light", "diet", "decaf", "magnum", "half"];

const qualifierSet = (value: unknown): Set<string> => {
  const text = normalizeMatchText(value);
  const set = new Set<string>();
  for (const q of QUALIFIERS) if (new RegExp(`\\b${q}\\b`).test(text)) set.add("empty");
  for (const v of VARIANTS) if (text.includes(v)) set.add(v);
  return set;
};

const UOM_ALIASES: Record<string, string> = {
  btl: "bottle", bottles: "bottle", bot: "bottle", bottle: "bottle",
  cs: "case", cases: "case", case: "case", ctn: "case", carton: "case",
  pcs: "piece", pc: "piece", piece: "piece", pieces: "piece", ea: "piece", each: "piece", unit: "piece",
  kegs: "keg", keg: "keg",
  can: "can", cans: "can", tin: "can", tins: "can",
  bag: "bag", bags: "bag", box: "box", boxes: "box",
  kg: "kg", kgs: "kg", kilogram: "kg", g: "g", gram: "g", grams: "g",
  l: "l", ltr: "l", litre: "l", liter: "l", liters: "l", litres: "l",
  pack: "pack", packs: "pack", pk: "pack", dozen: "dozen", dz: "dozen",
};

export const canonicalUom = (value: unknown): string => {
  const n = normalizeMatchText(value).replace(/\s+/g, "");
  return UOM_ALIASES[n] || n;
};

export interface ContradictionCheck {
  contradicts: boolean;
  reason: string;
}

/** Size / qualifier / UOM contradictions between a scanned line and a candidate. */
export function detectContradiction(line: SupplierMatchLine, row: SupplierMatchRow): ContradictionCheck {
  const lineText = `${line.scanned_description || line.description || ""} ${line.pack_size || ""}`;
  const rowText = `${row.supplier_product_name || ""} ${row.internal_product_name || ""} ${row.pack_size || ""}`;

  const lineSizes = sizeTokens(lineText);
  const rowSizes = sizeTokens(rowText);
  if (lineSizes.length && rowSizes.length && !lineSizes.some((s) => rowSizes.includes(s))) {
    return { contradicts: true, reason: `Pack size differs (invoice ${lineSizes.join("/")} vs item ${rowSizes.join("/")})` };
  }

  const lineQual = qualifierSet(lineText);
  const rowQual = qualifierSet(rowText);
  const qualMismatch = [...lineQual].some((q) => !rowQual.has(q)) || [...rowQual].some((q) => !lineQual.has(q));
  if (qualMismatch) {
    return { contradicts: true, reason: "Product variant/qualifier differs (e.g. empty/return or variant)" };
  }

  const lineUom = canonicalUom(line.unit);
  const rowUom = canonicalUom(row.purchase_unit);
  if (lineUom && rowUom && lineUom !== rowUom) {
    return { contradicts: true, reason: `Purchase UOM differs (invoice ${line.unit} vs item ${row.purchase_unit})` };
  }

  return { contradicts: false, reason: "" };
}

const distinctSkus = (rows: SupplierMatchRow[]): string[] =>
  Array.from(new Set(rows.map((r) => r.internal_sku).filter(Boolean)));

/**
 * Deterministic supplier-scoped match. Evaluates SKU evidence AND name evidence
 * before classifying, so an unknown printed supplier code can no longer hide a
 * unique exact supplier-name match.
 */
export function findTrustedProductMatch(
  line: SupplierMatchLine,
  supplierName: string,
  productMaster: SupplierMatchRow[],
  requestedSku?: string,
): SupplierMatchResult {
  const rows = Array.isArray(productMaster) ? productMaster : [];
  const code = normalizeMatchSku(line?.scanned_item_code || line?.item_code);
  const rawDescription = line?.scanned_description || line?.description;
  const desc = normalizeMatchText(rawDescription);
  const usableCode = code.replace(/[^a-z0-9]/g, "").length >= 4;

  // 1. Strict supplier scoping. When the supplier is known we never look at
  //    another supplier's rows, not even to break a tie.
  const hasSupplier = !!normalizeMatchText(supplierName);
  const scope = hasSupplier ? rows.filter((p) => supplierMatches(p.supplier, supplierName)) : rows;
  if (!scope.length) {
    return {
      status: "unmatched",
      row: null,
      reason: hasSupplier
        ? "No Items Master entry exists for this supplier."
        : "No supplier selected for matching.",
      warnings: [],
      hardConflict: false,
      candidates: [],
    };
  }

  const warnings: string[] = [];

  // 2. Exact same-supplier external SKU evidence.
  const skuMatches = usableCode ? scope.filter((p) => externalSkuSegments(p.external_sku).includes(code)) : [];
  const skuSkus = distinctSkus(skuMatches);

  if (skuSkus.length === 1) {
    const row = skuMatches[0];
    if (namesAgree(rawDescription, row)) {
      const clash = detectContradiction(line, row);
      if (clash.contradicts) {
        return {
          status: "needs_review",
          row: null,
          reason: clash.reason,
          warnings,
          hardConflict: true,
          candidates: skuSkus,
        };
      }
      return {
        status: "matched",
        row,
        reason: "Exact supplier item code and name match",
        warnings,
        hardConflict: false,
        candidates: skuSkus,
      };
    }
    // The printed code IS registered for this supplier, but to a product whose
    // name does not support this line: contradictory evidence, never a fallback.
    return {
      status: "needs_review",
      row: null,
      reason: `Supplier code ${line?.scanned_item_code || line?.item_code} is registered to a different item (${row.internal_sku}) for this supplier.`,
      warnings,
      hardConflict: true,
      candidates: skuSkus,
    };
  }

  if (skuSkus.length > 1) {
    const requested = requestedSku ? skuMatches.find((p) => p.internal_sku === requestedSku) : undefined;
    if (requested && namesAgree(rawDescription, requested) && !detectContradiction(line, requested).contradicts) {
      return {
        status: "matched",
        row: requested,
        reason: "Exact supplier item code and name match",
        warnings,
        hardConflict: false,
        candidates: skuSkus,
      };
    }
    return {
      status: "possible_match",
      row: null,
      reason: "Supplier code matches more than one item for this supplier.",
      warnings,
      hardConflict: false,
      candidates: skuSkus,
    };
  }

  // 3. No registered SKU evidence at all -> missing evidence, keep evaluating.
  if (usableCode) {
    warnings.push(`Supplier code ${String(line?.scanned_item_code || line?.item_code).trim()} is not yet recorded for this product.`);
  }

  if (!desc) {
    return {
      status: "needs_review",
      row: null,
      reason: "No usable supplier code or product name on this line.",
      warnings,
      hardConflict: false,
      candidates: [],
    };
  }

  const nameMatches = scope.filter((p) => namesExactlyEqual(rawDescription, p));
  const nameSkus = distinctSkus(nameMatches);

  if (nameSkus.length === 1) {
    const row = nameMatches[0];
    const clash = detectContradiction(line, row);
    if (clash.contradicts) {
      return {
        status: "needs_review",
        row: null,
        reason: clash.reason,
        warnings,
        hardConflict: true,
        candidates: nameSkus,
      };
    }
    return {
      status: "matched",
      row,
      reason: "Exact supplier item name match",
      warnings,
      hardConflict: false,
      candidates: nameSkus,
    };
  }

  if (nameSkus.length > 1) {
    return {
      status: "possible_match",
      row: null,
      reason: "Several items for this supplier share this name.",
      warnings,
      hardConflict: false,
      candidates: nameSkus,
    };
  }

  return {
    status: "unmatched",
    row: null,
    reason: "No exact supplier code or name match for this supplier.",
    warnings,
    hardConflict: false,
    candidates: [],
  };
}

const GENERIC_REVIEW_REASONS = [
  "items master match needs manual review",
  "match was not supported by an exact supplier item code/name match",
  "agent 2 review was unavailable",
  "review agent did not return an items master decision",
  "not verified",
  "",
];

export const isGenericReviewReason = (reason?: unknown): boolean => {
  const r = String(reason ?? "").trim().toLowerCase();
  if (!r) return true;
  return GENERIC_REVIEW_REASONS.some((g) => g && r.includes(g));
};

/**
 * One final policy reconciling the AI reviewer's decision with the deterministic
 * supplier-scoped result.
 *  - a hard conflict always wins (never overridden by confidence);
 *  - a generic reviewer "needs_review" does not override a deterministic unique
 *    exact same-supplier match.
 */
export function reconcileMatchDecision(
  reviewerStatus: string | undefined,
  reviewerReason: string | undefined,
  local: SupplierMatchResult,
): { status: SupplierMatchStatus; reason: string; warnings: string[]; blocking: boolean; internalSku: string } {
  if (local.hardConflict) {
    return { status: "needs_review", reason: local.reason, warnings: local.warnings, blocking: true, internalSku: "" };
  }
  if (local.status === "matched" && local.row) {
    return {
      status: "matched",
      reason: local.reason,
      warnings: local.warnings,
      blocking: false,
      internalSku: local.row.internal_sku,
    };
  }
  if (local.status === "possible_match") {
    return { status: "possible_match", reason: local.reason, warnings: local.warnings, blocking: true, internalSku: "" };
  }
  const reason = isGenericReviewReason(reviewerReason) ? local.reason : String(reviewerReason);
  const status: SupplierMatchStatus =
    reviewerStatus === "new_item" ? "unmatched" : (local.status === "unmatched" ? "unmatched" : "needs_review");
  return { status, reason, warnings: local.warnings, blocking: status !== "unmatched", internalSku: "" };
}
