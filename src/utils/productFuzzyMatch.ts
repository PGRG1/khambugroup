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
  /** Top-2 within this gap = ambiguous, worth asking the AI. */
  AMBIGUOUS_GAP: 0.03,
  /** How many candidates we keep per line. */
  MAX_SUGGESTIONS: 3,
  /** How many candidates we shortlist for the AI fallback. */
  AI_SHORTLIST: 15,
} as const;

export interface FuzzyCandidate {
  entry: PMEntry;
  score: number;
  reasons: string[];
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "with", "fresh", "pcs", "pc"]);

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

    return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};

const tokens = (v: string): string[] =>
  normalizeText(v)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);

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

/** Extract size tokens like "125g", "250 ml", "1kg". */
const sizeTokens = (v: string): string[] => {
  const out: string[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|lb|oz|pcs?|pack|btl|bottle)\b/gi;
  let m: RegExpExecArray | null;
  const s = (v || "").toLowerCase();
  while ((m = re.exec(s))) out.push(`${parseFloat(m[1])}${m[2].replace(/s$/, "")}`);
  return out;
};

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

  const lineSizes = sizeTokens(desc);

  const scored: FuzzyCandidate[] = [];
  for (const p of products) {
    const reasons: string[] = [];
    let best = 0;

    if (desc) {
      const sSupplierName = textScore(desc, p.supplier_product_name || "");
      const sInternalName = textScore(desc, p.internal_product_name || "");
      if (sSupplierName >= sInternalName) {
        best = sSupplierName;
        if (sSupplierName > 0) reasons.push("name similar to supplier name");
      } else {
        best = sInternalName;
        if (sInternalName > 0) reasons.push("name similar to internal name");
      }
    }

    if (code) {
      const sCode = textScore(code, p.external_sku || "");
      if (sCode > best) {
        best = sCode;
        reasons.length = 0;
        reasons.push("code similar to external SKU");
      } else if (sCode > 0.8) {
        best = Math.min(1, best + 0.05);
        reasons.push("code also similar");
      }
    }

    if (best <= 0) continue;

    // Size token agreement (125G vs 125g)
    if (lineSizes.length) {
      const candSizes = sizeTokens(`${p.supplier_product_name || ""} ${p.internal_product_name || ""}`);
      if (candSizes.length) {
        if (lineSizes.some((s) => candSizes.includes(s))) {
          best = Math.min(1, best + 0.06);
          reasons.push("pack size matches");
        } else {
          best = Math.max(0, best - 0.05);
          reasons.push("pack size differs");
        }
      }
    }

    // Same-supplier boost so a same-supplier 0.80 beats another supplier's 0.85
    if (invoiceSupplier && supplierMatch(p.supplier, invoiceSupplier)) {
      best = Math.min(1, best + 0.1);
      reasons.push("same supplier");
    } else if (invoiceSupplier && p.supplier) {
      best = Math.max(0, best - 0.05);
    }

    scored.push({ entry: p, score: Math.round(best * 1000) / 1000, reasons });
  }

  scored.sort((a, b) => b.score - a.score);

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
  const top = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  const ambiguous = !!(top && second && top.score - second.score <= FUZZY.AMBIGUOUS_GAP);
  const suggestions = candidates.slice(0, FUZZY.MAX_SUGGESTIONS);

  if (!top || top.score < FUZZY.SUGGEST) return { action: "ask_ai", top, suggestions: [], ambiguous };
  if (top.score >= FUZZY.AUTO_LINK && !ambiguous) return { action: "auto_link", top, suggestions, ambiguous };
  return { action: "suggest", top, suggestions, ambiguous };
}
