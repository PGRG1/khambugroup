/**
 * Final reconciliation policy between the AI reviewer's Items Master decision
 * and the scanner's deterministic supplier-scoped evidence.
 *
 * Rules (mirrors supabase/functions/_shared/supplierMatch.ts):
 *  - Supplier scoping is absolute: callers must pass only the selected
 *    supplier's Product Master entries.
 *  - A hard conflict (printed code registered to another same-supplier item,
 *    size / qualifier / UOM contradiction) is never overridden by confidence.
 *  - A generic reviewer "needs review" does not override a unique exact
 *    same-supplier name match when no hard conflict exists.
 */

import type { PMEntry } from "./productMasterResolver";
import type { FuzzyCandidate } from "./productFuzzyMatch";

export const normalizeMatchName = (value: string | undefined | null): string =>
  (value || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\b(limited|ltd|co|company|inc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when two names are identical after normalization (case/punctuation). */
export const namesNormalizedEqual = (a?: string | null, b?: string | null): boolean => {
  const na = normalizeMatchName(a);
  const nb = normalizeMatchName(b);
  return !!na && na === nb;
};

export const entryNameEqualsDescription = (description: string | undefined | null, entry: PMEntry): boolean =>
  namesNormalizedEqual(description, entry.supplier_product_name) ||
  namesNormalizedEqual(description, entry.internal_product_name);

/**
 * Unique exact-name entry inside an already supplier-scoped Product Master list.
 * Returns null when nothing matches or when several distinct products share the name.
 */
export function findUniqueExactNameEntry(
  description: string | undefined | null,
  supplierScopedPm: PMEntry[],
): PMEntry | null {
  if (!normalizeMatchName(description)) return null;
  const hits = (supplierScopedPm || []).filter((p) => entryNameEqualsDescription(description, p));
  const distinct = Array.from(new Set(hits.map((h) => h.internal_sku).filter(Boolean)));
  if (hits.length === 0 || distinct.length !== 1) return null;
  return hits[0];
}

const GENERIC_REVIEW_MESSAGES = [
  "items master match needs manual review",
  "match was not supported by an exact supplier item code/name match",
  "agent 2 review was unavailable",
  "review agent did not return an items master decision",
  "was not verified by agent 2",
  "match not verified",
];

/** A reviewer signal that carries no specific contradiction. */
export const isGenericReviewSignal = (message?: string | null): boolean => {
  const m = (message || "").trim().toLowerCase();
  if (!m) return true;
  return GENERIC_REVIEW_MESSAGES.some((g) => m.includes(g));
};

/** Blocking reviewer messages that describe a real contradiction. */
export const hasHardConflictSignal = (messages: string[] | undefined, reason?: string | null): boolean => {
  const all = [...(messages || []), reason || ""].map((m) => m.toLowerCase());
  return all.some((m) =>
    !!m &&
    !isGenericReviewSignal(m) &&
    (m.includes("registered to a different") ||
      m.includes("pack size differs") ||
      m.includes("qualifier differs") ||
      m.includes("variant") ||
      m.includes("uom differs") ||
      m.includes("more than one") ||
      m.includes("several items")),
  );
};

export interface ReviewerOverrideInput {
  reviewStatus?: "matched" | "possible_match" | "new_item" | "needs_review";
  reviewBlocking?: string[];
  reviewReason?: string | null;
  description?: string | null;
  /** Already supplier-scoped Product Master entries. */
  supplierScopedPm: PMEntry[];
}

export interface ReviewerOverrideResult {
  /** The line must stay unmatched for a human to resolve. */
  requiresManualAction: boolean;
  /** Deterministic entry that may be linked despite a generic reviewer hold. */
  deterministicEntry: PMEntry | null;
  reason?: string;
}

/**
 * Decide whether the reviewer's manual-review hold survives the deterministic
 * supplier-scoped evidence.
 */
export function reconcileReviewerHold(input: ReviewerOverrideInput): ReviewerOverrideResult {
  const holds =
    input.reviewStatus === "needs_review" ||
    input.reviewStatus === "possible_match" ||
    input.reviewStatus === "new_item" ||
    (input.reviewBlocking || []).some((msg) => msg.toLowerCase().startsWith("matched_sku:"));

  if (!holds) return { requiresManualAction: false, deterministicEntry: null };

  // Contradictory evidence always wins.
  if (hasHardConflictSignal(input.reviewBlocking, input.reviewReason)) {
    return { requiresManualAction: true, deterministicEntry: null, reason: input.reviewReason || undefined };
  }
  // "new_item" is an explicit statement that no item exists yet.
  if (input.reviewStatus === "new_item") {
    return { requiresManualAction: true, deterministicEntry: null, reason: input.reviewReason || undefined };
  }
  // Possible match = ambiguity, keep manual review.
  if (input.reviewStatus === "possible_match") {
    return { requiresManualAction: true, deterministicEntry: null, reason: input.reviewReason || undefined };
  }

  const generic = isGenericReviewSignal(input.reviewReason) &&
    (input.reviewBlocking || []).every((msg) => isGenericReviewSignal(msg.replace(/^matched_sku:\s*/i, "")));
  if (!generic) {
    return { requiresManualAction: true, deterministicEntry: null, reason: input.reviewReason || undefined };
  }

  const entry = findUniqueExactNameEntry(input.description, input.supplierScopedPm);
  if (entry) {
    return { requiresManualAction: false, deterministicEntry: entry, reason: "Exact supplier item name match" };
  }
  return { requiresManualAction: true, deterministicEntry: null, reason: input.reviewReason || undefined };
}

export interface HoldReasonInput {
  description?: string | null;
  ambiguous?: boolean;
  top?: FuzzyCandidate | null;
  reviewReason?: string | null;
  /** Printed supplier code that Product Master does not know for this supplier. */
  unknownSupplierCode?: string | null;
}

/**
 * Human-readable hold reason. Never claims "Name differs" when the suggestion's
 * name is identical to the scanned description after normalization.
 */
export function describeMatchHoldReason(input: HoldReasonInput): string | undefined {
  if (input.ambiguous) return "Close alternatives";
  const specificReview = input.reviewReason && !isGenericReviewSignal(input.reviewReason)
    ? input.reviewReason
    : undefined;
  const blocking = input.top?.blockingReasons?.[0];
  if (blocking) return blocking;
  if (specificReview) return specificReview;
  if (!input.top) return undefined;
  const namesEqual = entryNameEqualsDescription(input.description, input.top.entry as PMEntry);
  if (namesEqual) {
    if (input.unknownSupplierCode) {
      return `Supplier code ${input.unknownSupplierCode} is not yet recorded for this product.`;
    }
    return "Needs confirmation";
  }
  return "Name differs";
}

/** Printed code that is not registered to any of this supplier's entries. */
export function unknownSupplierCodeWarning(
  scannedCode: string | undefined | null,
  supplierScopedPm: PMEntry[],
): string | null {
  const code = (scannedCode || "").trim().toLowerCase();
  if (code.replace(/[^a-z0-9]/g, "").length < 4) return null;
  const known = (supplierScopedPm || []).some((p) =>
    (p.external_sku || "")
      .toLowerCase()
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(code),
  );
  return known ? null : `Supplier code ${(scannedCode || "").trim()} is not yet recorded for this product.`;
}
