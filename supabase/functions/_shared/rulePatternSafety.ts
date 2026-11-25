// Safety checks for rules people teach Bani (bank lines, invoice lines).
// A rule is applied to every future item it matches, so it must be narrow and predictable:
// plain text or exact field values only (no regular expressions), and never text so short or
// generic that it would catch unrelated payments.

export type RulePattern = { contains?: string; equals?: string; eq?: Record<string, unknown>; eq_all?: Record<string, unknown> };
export type PatternCheck = { ok: true; pattern: RulePattern } | { ok: false; reason: string };

const MIN_TEXT = 4;
// Words that appear on many unrelated bank lines; a rule made only of these would catch too much.
const GENERIC = new Set([
  "payment", "payments", "transfer", "trf", "fps", "hk", "hkd", "fee", "fees", "pos", "card", "credit", "debit",
  "online", "bank", "ltd", "limited", "co", "company", "to", "from", "the", "of", "and", "atm", "cheque", "chq",
  "int", "interest", "ref", "no", "inward", "outward", "remittance", "charge", "charges", "service", "services",
]);
const BLOCKED_FIELDS = /(^id$|_id$|^tenant|created|updated|amount|total|price|date)/i;

function textProblem(raw: unknown, label: string): string | null {
  if (typeof raw !== "string") return `${label} must be text`;
  const text = raw.trim();
  if (text.length < MIN_TEXT) return `${label} is too short to be a safe rule`;
  if ((text.match(/[a-z]/gi) ?? []).length < 3) return `${label} needs at least a few letters`;
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length && words.every((w) => GENERIC.has(w) || /^\d+$/.test(w))) return `${label} is too general`;
  return null;
}

function fieldsProblem(raw: unknown, label: string): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return `${label} must list fields`;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (!entries.length) return `${label} has no fields`;
  for (const [k, v] of entries) {
    if (BLOCKED_FIELDS.test(k)) return `${label} can't depend on ${k}`;
    if (v == null || String(v).trim() === "") return `${label} has an empty value for ${k}`;
    if (typeof v === "object") return `${label} value for ${k} must be plain`;
  }
  return null;
}

/** Checks a pattern before it becomes a rule. Only contains, equals, eq and eq_all are allowed. */
export function checkRulePattern(pattern: unknown): PatternCheck {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) return { ok: false, reason: "No rule pattern" };
  const p = pattern as Record<string, unknown>;
  const allowed = ["contains", "equals", "eq", "eq_all"];
  const extra = Object.keys(p).filter((k) => !allowed.includes(k));
  if (extra.length) return { ok: false, reason: `Rules can't use ${extra.join(", ")}` };
  const out: RulePattern = {};
  for (const k of ["contains", "equals"] as const) {
    if (p[k] === undefined) continue;
    const bad = textProblem(p[k], k === "contains" ? "The matching text" : "The exact text");
    if (bad) return { ok: false, reason: bad };
    out[k] = String(p[k]).trim();
  }
  for (const k of ["eq", "eq_all"] as const) {
    if (p[k] === undefined) continue;
    const bad = fieldsProblem(p[k], "The rule");
    if (bad) return { ok: false, reason: bad };
    out[k] = p[k] as Record<string, unknown>;
  }
  if (!Object.keys(out).length) return { ok: false, reason: "No rule pattern" };
  return { ok: true, pattern: out };
}

/** Who may switch a taught rule on straight away: Bani, the business's admins, or a role with Approve (3) on Finance. */
export function canApproveRules(role: string | null | undefined, isPlatformAdmin: boolean, financeLevel?: number | null): boolean {
  return isPlatformAdmin || role === "tenant_admin" || role === "super_admin" || role === "platform_admin" || Number(financeLevel ?? 0) >= 3;
}
