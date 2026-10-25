import { scoreCandidates, type FuzzyCandidate } from "./productFuzzyMatch";
import type { PMEntry } from "./productMasterResolver";

/** Max candidates Bani may offer per unmatched line. */
export const BANI_MAX_OPTIONS = 3;
/** Below this the whole supplier catalogue is sent to Bani instead of a name shortlist. */
export const BANI_FULL_CATALOGUE_LIMIT = 150;

export interface BaniRawOption {
  product_master_id?: string | null;
  internal_sku?: string | null;
  confidence?: number;
  reason?: string | null;
}

/** Normalise the model output: either `{candidates:[...]}` or a single legacy suggestion. */
export function rawOptionsOf(suggestion: any): BaniRawOption[] {
  if (!suggestion || typeof suggestion !== "object") return [];
  if (Array.isArray(suggestion.candidates)) return suggestion.candidates.filter((c: any) => c && typeof c === "object");
  if (suggestion.product_master_id || suggestion.internal_sku) {
    return [{ ...suggestion, reason: suggestion.reason || suggestion.needs_review_reason || null }];
  }
  return [];
}

/**
 * Turn Bani's picks into pickable options. Options must be entries of the invoice
 * supplier (strict scope); nothing is linked here — the user chooses.
 */
export function buildBaniSuggestions(
  options: BaniRawOption[],
  scopedPM: PMEntry[],
  line: { description?: string; itemCode?: string },
  supplierName: string,
): FuzzyCandidate[] {
  const out: FuzzyCandidate[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    const conf = Number(o.confidence ?? 0);
    if (!Number.isFinite(conf) || conf < 0.35) continue;
    const entry =
      scopedPM.find((p) => o.product_master_id && p.id === o.product_master_id) ||
      scopedPM.find((p) => o.internal_sku && p.internal_sku === o.internal_sku);
    if (!entry) continue;
    const key = entry.supplier_entry_id || entry.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const [local] = scoreCandidates(line, [entry], supplierName, 1);
    const confidence = Math.min(Math.max(conf, 0), 0.99);
    out.push({
      entry,
      score: confidence,
      rawNameScore: local?.rawNameScore ?? 0,
      confidence,
      reasons: [String(o.reason || "Bani suggestion").slice(0, 160)],
      blockingReasons: local?.blockingReasons ?? [],
      disqualified: false,
    });
    if (out.length >= BANI_MAX_OPTIONS) break;
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
