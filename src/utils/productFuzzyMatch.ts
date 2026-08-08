/**
 * Fuzzy "did you mean?" matching for invoice lines against the Product Master.
 *
 * This layer runs ONLY after the exact resolver (productMasterResolver) returns
 * null. It never changes save-time behaviour on its own — the scanner decides
 * whether to auto-link (very high score) or show a suggestion chip.
 */

import type { PMEntry } from "./productMasterResolver";

/** Tunable thresholds — all scores are 0..1. */
export const FUZZY = {
  /** At or above this the line is auto-linked (still flagged as auto-matched). */
  AUTO_LINK: 0.92,
  /** At or above this we show a "Did you mean …?" suggestion. */
  SUGGEST: 0.6,
  /** Name-only confidence required before anything is shown as a suggestion. */
  SUGGEST_NAME: 0.55,
  /** Top-2 within this gap = ambiguous, worth asking the AI. */
  AMBIGUOUS_GAP: 0.08,
  /** Name evidence required before any ranking bonuses may auto-link. */
  AUTO_LINK_NAME: 0.92,
  /** How many candidates we keep per line. */
  MAX_SUGGESTIONS: 3,
  /** How many candidates we shortlist for the AI fallback. */
  AI_SHORTLIST: 15,
} as const;

export interface FuzzyCandidate {
  entry: PMEntry;
  /** Final score used only to rank suggestions. */
  score: number;
  /** Name-only confidence, before supplier / code / pack bonuses. */
  rawNameScore: number;
  /** Honest confidence shown to the user (identical to rawNameScore). */
  confidence: number;
  reasons: string[];
  blockingReasons: string[];
  /** True when the candidate must never be offered (qualifier / no shared evidence). */
  disqualified: boolean;
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "with", "fresh", "pcs", "pc", "product",
  "bottle", "btl", "pack", "case", "box", "imported", "origin", "country",
]);

/** Words that carry no identifying evidence on their own. */
const GENERIC_TOKENS = new Set([
  ...STOPWORDS,
  "keg", "kegs", "can", "cans", "tin", "carton", "ctn", "bag", "unit", "units",
  "ref", "no", "item", "code", "each", "ea", "dz", "dozen", "set",
  "empty", "return", "returns", "returned", "deposit", "refund", "full", "new",
  "beer", "draught", "draft",
]);

export const normalizeText = (v: string | undefined | null): string =>
  (v || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeSupplier = (v?: string) =>
  normalizeText(v).replace(/\b(limited|ltd|co|company)\b/g, " ").replace(/\s+/g, " ").trim();

const supplierMatch = (a?: string, b?: string) => {
  if (!a || !b) return false;
  const na = normalizeSupplier(a);
  const nb = normalizeSupplier(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

/** Crude singular/plural + common-suffix stemming so "tomatoes" ~ "tomato". */
const stem = (w: string): string => {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes") || w.endsWith("ches") || w.endsWith("shes"))
    return w.slice(0, -2);

  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};

const tokens = (v: string): string[] =>
  normalizeText(v)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);

/**
 * Tokens that actually identify a product: brand / head noun.
 * Drops generic packaging words, qualifiers, pure numbers and size tokens.
 */
export const distinctiveTokens = (v: string, supplier?: string): Set<string> => {
  const supplierWords = new Set(normalizeSupplier(supplier).split(" ").filter(Boolean).map(stem));
  const out = new Set<string>();
  normalizeText(v)
    .split(" ")
    .forEach((raw) => {
      if (!raw) return;
      if (/^\d/.test(raw)) return; // 30l, 330ml, 6b15, numbers
      if (raw.length < 3 && !/[\u4e00-\u9fff]/.test(raw)) return;
      const t = stem(raw);
      if (GENERIC_TOKENS.has(t) || GENERIC_TOKENS.has(raw)) return;
      if (supplierWords.has(t)) return;
      out.add(t);
    });
  return out;
};

const sharesDistinctiveToken = (a: Set<string>, b: Set<string>): boolean => {
  if (!a.size || !b.size) return false;
  for (const t of a) if (b.has(t)) return true;
  return false;
};

/** empty / returnable-container lines are a different product from the full one. */
export type LineQualifier = "empty" | "standard";

export const qualifierOf = (v: string): LineQualifier => {
  const s = normalizeText(v);
  if (!s) return "standard";
  if (/\b(empty|empties|return|returns|returned|deposit|refund|collection)\b/.test(s)) return "empty";
  return "standard";
};

/** Lines that are charges, not products — never suggest a product for these. */
export const isNonProductLine = (v: string | undefined | null): boolean => {
  const s = normalizeText(v);
  if (!s) return false;
  return /\b(delivery|freight|shipping|surcharge|fuel charge|service charge|handling|discount|rebate|rounding|adjustment|subtotal|total|vat|gst)\b/.test(s)
    && !/\b(keg|bottle|can|case|box)\b/.test(s);
};

/** Dice coefficient over token sets. */
const tokenDice = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  setA.forEach((t) => {
    if (setB.has(t)) inter++;
  });
  return (2 * inter) / (setA.size + setB.size);
};

const trigrams = (v: string): Set<string> => {
  const s = ` ${normalizeText(v).replace(/\s+/g, " ")} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
};

/** Dice coefficient over character trigrams — tolerant of typos. */
const trigramSim = (a: string, b: string): number => {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((g) => {
    if (tb.has(g)) inter++;
  });
  return (2 * inter) / (ta.size + tb.size);
};

/** Extract normalized quantity tokens so 1L equals 1000ml but conflicts with 70cl. */
const sizeTokens = (v: string): string[] => {
  const out: string[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l|lb|oz|pcs?|pack|btl|bottle)\b/gi;
  let m: RegExpExecArray | null;
  const s = (v || "").toLowerCase();
  while ((m = re.exec(s))) {
    const value = parseFloat(m[1]);
    const unit = m[2].replace(/s$/, "");
    if (unit === "l") out.push(`${value * 1000}ml`);
    else if (unit === "cl") out.push(`${value * 10}ml`);
    else if (unit === "kg") out.push(`${value * 1000}g`);
    else if (unit === "bottle" || unit === "btl") out.push(`${value}btl`);
    else out.push(`${value}${unit}`);
  }
  const packCount = /\b(\d+)\s*[x×]\s*\d/i.exec(s);
  if (packCount) out.push(`${parseInt(packCount[1], 10)}packcount`);
  return out;
};

const hasSizeConflict = (line: string[], candidate: string[]) =>
  line.length > 0 && candidate.length > 0 && !line.some((token) => candidate.includes(token));

const textScore = (query: string, target: string): number => {
  if (!query || !target) return 0;
  const dice = tokenDice(tokens(query), tokens(target));
  const tri = trigramSim(query, target);
  let score = 0.6 * dice + 0.4 * tri;
  const nq = normalizeText(query);
  const nt = normalizeText(target);
  if (nq === nt) return 1;
  // Prefix / containment bonus: "strawberry" vs "strawberry (250g)"
  if (nq && nt && (nt.startsWith(nq) || nq.startsWith(nt))) score += 0.12;
  else if (nq && nt && (nt.includes(nq) || nq.includes(nt))) score += 0.08;
  return Math.min(score, 1);
};

export interface FuzzyLineInput {
  itemCode?: string;
  description?: string;
}

/**
 * Score every product-master entry against a scanned line and return the
 * best candidates, highest score first.
 */
export function scoreCandidates(
  line: FuzzyLineInput,
  products: PMEntry[],
  invoiceSupplier?: string,
  limit: number = FUZZY.AI_SHORTLIST,
): FuzzyCandidate[] {
  const desc = (line.description || "").trim();
  const code = (line.itemCode || "").trim();
  if (!desc && !code) return [];
  if (isNonProductLine(desc)) return [];

  const lineSizes = sizeTokens(desc);
  const lineQualifier = qualifierOf(desc);
  const lineDistinct = distinctiveTokens(desc, invoiceSupplier);

  const scored: FuzzyCandidate[] = [];
  for (const p of products) {
    const reasons: string[] = [];
    const blockingReasons: string[] = [];
    let disqualified = false;
    let rawNameScore = 0;
    let rankingScore = 0;

    if (desc) {
      const sSupplierName = textScore(desc, p.supplier_product_name || "");
      const sInternalName = textScore(desc, p.internal_product_name || "");
      if (sSupplierName >= sInternalName) {
        rawNameScore = sSupplierName;
        if (sSupplierName > 0) reasons.push("name similar to supplier name");
      } else {
        rawNameScore = sInternalName;
        if (sInternalName > 0) reasons.push("name similar to internal name");
      }
      rankingScore = rawNameScore;
    }

    if (code) {
      const sCode = textScore(code, p.external_sku || "");
      if (!desc && sCode > rankingScore) {
        rankingScore = sCode;
        reasons.push("code similar to external SKU");
      } else if (sCode > 0.8) {
        rankingScore = Math.min(1, rankingScore + 0.05);
        reasons.push("code also similar");
      }
    }

    if (rankingScore <= 0) continue;

    const candidateText = `${p.supplier_product_name || ""} ${p.internal_product_name || ""}`;

    // Empty / return qualifier must agree — an empty keg is not the full product.
    if (desc) {
      const candQualifier = qualifierOf(candidateText);
      if (candQualifier !== lineQualifier) {
        rankingScore = Math.max(0, rankingScore - 0.3);
        blockingReasons.push(lineQualifier === "empty" ? "empty/return item" : "empty/return variant");
        disqualified = true;
      } else if (lineQualifier === "empty") {
        rankingScore = Math.min(1, rankingScore + 0.08);
        reasons.push("empty/return variant matches");
      }
    }

    // At least one distinctive (brand / head-noun) token must be shared.
    if (desc && lineDistinct.size) {
      const candDistinct = distinctiveTokens(candidateText, p.supplier);
      if (!sharesDistinctiveToken(lineDistinct, candDistinct)) {
        blockingReasons.push("different brand");
        disqualified = true;
      }
    }

    // Size token agreement (125G vs 125g)
    if (lineSizes.length) {
      const candSizes = sizeTokens(candidateText);
      if (candSizes.length) {
        if (lineSizes.some((s) => candSizes.includes(s))) {
          rankingScore = Math.min(1, rankingScore + 0.06);
          reasons.push("pack size matches");
        } else if (hasSizeConflict(lineSizes, candSizes)) {
          rankingScore = Math.max(0, rankingScore - 0.12);
          reasons.push("pack size differs");
          blockingReasons.push("size differs");
        }
      }
    }

    // Same-supplier boost so a same-supplier 0.80 beats another supplier's 0.85
    if (invoiceSupplier && supplierMatch(p.supplier, invoiceSupplier)) {
      rankingScore = Math.min(1, rankingScore + 0.1);
      reasons.push("same supplier");
    } else if (invoiceSupplier && p.supplier) {
      rankingScore = Math.max(0, rankingScore - 0.05);
    }

    const raw = Math.round(rawNameScore * 1000) / 1000;
    scored.push({
      entry: p,
      score: Math.round(rankingScore * 1000) / 1000,
      rawNameScore: raw,
      confidence: raw,
      reasons,
      blockingReasons,
      disqualified,
    });
  }

  scored.sort((a, b) => {
    if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
    return b.score - a.score;
  });

  // De-duplicate by supplier entry / product so the list shows distinct products
  const seen = new Set<string>();
  const unique: FuzzyCandidate[] = [];
  for (const c of scored) {
    const key = c.entry.supplier_entry_id || `${c.entry.id}:${c.entry.internal_sku}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** Convenience wrapper used by the UI: what should we do with this line? */
export function classifyCandidates(candidates: FuzzyCandidate[]): {
  action: "auto_link" | "suggest" | "ask_ai";
  top: FuzzyCandidate | null;
  suggestions: FuzzyCandidate[];
  ambiguous: boolean;
} {
  const eligible = candidates.filter((c) => !c.disqualified);
  const top = eligible[0] ?? candidates[0] ?? null;
  const second = eligible[1] ?? null;
  const ambiguous = !!(eligible[0] && second && eligible[0].score - second.score <= FUZZY.AMBIGUOUS_GAP);

  const best = eligible[0] ?? null;
  if (!best || best.score < FUZZY.SUGGEST || best.rawNameScore < FUZZY.SUGGEST_NAME) {
    return { action: "ask_ai", top, suggestions: [], ambiguous };
  }

  const suggestions = eligible.slice(0, FUZZY.MAX_SUGGESTIONS);
  if (
    best.score >= FUZZY.AUTO_LINK &&
    best.rawNameScore >= FUZZY.AUTO_LINK_NAME &&
    best.blockingReasons.length === 0 &&
    !ambiguous
  ) return { action: "auto_link", top: best, suggestions, ambiguous };
  return { action: "suggest", top: best, suggestions, ambiguous };
}

/** Is a candidate safe to show as a "did you mean?" suggestion at all? */
export function isSuggestable(c: FuzzyCandidate | null | undefined): boolean {
  return !!c && !c.disqualified && c.score >= FUZZY.SUGGEST && c.rawNameScore >= FUZZY.SUGGEST_NAME;
}
