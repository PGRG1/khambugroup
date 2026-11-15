// A held sales report with lines the client's setup doesn't know yet. Bani suggests what each
// new line is; a manager (or the Bani team) answers once and the line joins the setup.
// Pure (no Deno or network), so it can be tested directly.
import { normalizeDiscovered, CHOICES, choiceValue, LINE_KINDS, CATEGORIES, type DiscoveredLine, type LineKind, type Category } from "../parse-receipt/discoverLines.ts";
import { basicsFromLines, type ReadLine } from "./setupReceipt.ts";

const PREFIX = "New on this report: ";

/** The new line names in a held report's reasons (written by setupProblems). */
export function newLineNames(reasons: unknown): string[] {
  for (const r of Array.isArray(reasons) ? reasons : []) {
    const s = String(r);
    if (!s.startsWith(PREFIX)) continue;
    const body = s.slice(PREFIX.length).replace(/\. (Tell Bani what (it is|they are)|Map (it|them) in the sales report setup)$/, "");
    return body.split(", ").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/** Work-list wording for a held report with new lines. */
export function newLineTitle(names: string[], venue: string | null): string {
  const where = venue ? `${venue}'s report` : "a sales report";
  return names.length === 1 ? `${names[0]} is new on ${where}` : `${names.length} new lines on ${where}`;
}

/** What the rest of the report says about the gap, so Bani can reason from the numbers. */
export function gapHint(lines: ReadLine[]): string {
  const b = basicsFromLines(lines.filter((l) => l.known));
  const paid = lines.filter((l) => l.known && (l.kind === "payment" || l.kind === "delivery")).reduce((n, l) => n + (l.amount ?? 0), 0);
  if (!b.totalSales) return "";
  const short = Math.round((b.totalSales - paid) * 100) / 100;
  return short ? `Known payments add up to ${paid}; the report's total is ${b.totalSales}, so payments are ${short > 0 ? "short" : "over"} by ${Math.abs(short)}.` : `Known payments already equal the total (${b.totalSales}).`;
}

export function suggestPrompt(lines: ReadLine[], names: string[]): string {
  const known = lines.filter((l) => l.known).map((l) => `- "${l.printed}" = ${l.kind} (${l.amount ?? "no amount"})`).join("\n");
  const fresh = lines.filter((l) => names.some((n) => n.toLowerCase() === l.printed.toLowerCase())).map((l) => `- "${l.printed}" (${l.amount ?? "no amount"})`).join("\n");
  return `A restaurant's daily sales report has lines its setup does not know yet. Say what each new line is.
Return ONLY JSON: {"lines":[{"printed":"exactly as given","kind":"one of ${LINE_KINDS.join("|")}","category":"for kind sales only: ${CATEGORIES.join("|")}","settlesTo":"for kind payment only: bank|cash","sure":true or false,"why":"a few words","or":["up to 2 other likely meanings from: ${CHOICES.join("|")}"]}]}
sure: true only when the label plainly says what it is AND the numbers agree. Gift cards, vouchers, house accounts, staff meals,
"Other" or unclear abbreviations are never sure. Use the numbers: a line that closes a payment gap is likely a payment.
Lines already known on this report:
${known || "- none"}
${gapHint(lines)}
New lines:
${fresh}`;
}

export interface Suggestion extends DiscoveredLine { value: string }

/** Bani's answer, limited to the lines asked about; an unanswered line gets an unsure "ignore". */
export function normalizeSuggestions(raw: unknown, lines: ReadLine[], names: string[]): Suggestion[] {
  const got = normalizeDiscovered(raw).lines;
  return names.map((name) => {
    const amount = lines.find((l) => l.printed.toLowerCase() === name.toLowerCase())?.amount ?? null;
    const hit = got.find((g) => g.printed.toLowerCase() === name.toLowerCase());
    const line: DiscoveredLine = hit
      ? { ...hit, printed: name, amount }
      : { printed: name, amount, kind: "ignore", category: null, settlesTo: null, sure: false, reason: "Bani could not tell", alternatives: ["payment:bank", "voucher_used"] };
    return { ...line, value: choiceValue(line) };
  });
}

/** A chosen value as the columns sales_report_lines stores. */
export function mappingOf(value: string): { kind: LineKind; category: Category | null; settlesTo: "bank" | "cash" | null } | null {
  const [kind, a] = value.split(":");
  if (kind === "sales") return (CATEGORIES as readonly string[]).includes(a) ? { kind: "sales", category: a as Category, settlesTo: null } : null;
  if (kind === "payment") return { kind: "payment", category: null, settlesTo: a === "cash" ? "cash" : "bank" };
  return (LINE_KINDS as readonly string[]).includes(kind) && kind !== "sales" && kind !== "payment" ? { kind: kind as LineKind, category: null, settlesTo: null } : null;
}
