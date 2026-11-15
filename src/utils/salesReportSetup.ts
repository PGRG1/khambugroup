import { choiceValue, type DiscoveredReport, type LineKind, type Category } from "../../supabase/functions/parse-receipt/discoverLines";

export type { LineKind, Category };

/** One line of a client's sales report, as the setup screen holds it. */
export interface SetupLine {
  printed: string;
  kind: LineKind;
  category: Category | null;
  settlesTo: "bank" | "cash" | null;
  bankAccountId: string | null;
  /** Amount printed on each sample (by sample id); absent when that sample has no such line. */
  amounts: Record<string, number | null>;
  /** Bani is sure, or the team has answered: no question needed. Saved lines are settled. */
  sure?: boolean;
  /** Bani's reason, shown in the full list. */
  reason?: string;
  /** Other likely meanings Bani offers when unsure (choice values). */
  alternatives?: string[];
  /** Settled by the team's answer: later samples never reopen it. */
  answered?: boolean;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  food: "Food", bev_alc: "Beverage · alcoholic", bev_non: "Beverage · non-alc.", dessert: "Dessert", other: "Other sales",
};
const KIND_LABEL: Record<Exclude<LineKind, "sales" | "payment">, string> = {
  total: "Total sales", subtotal: "Subtotal", guests: "Guests", orders: "Orders", service_charge: "Service charge",
  discount: "Discount", tip: "Tips", delivery: "Delivery", voucher_sold: "Voucher sold", voucher_used: "Voucher used",
  deposit_taken: "Deposit taken", deposit_used: "Deposit used", ignore: "Not counted",
};

export type Group = "Basics" | "Sales" | "Payments" | "Other";
export const GROUPS: Group[] = ["Basics", "Sales", "Payments", "Other"];
export function groupOf(kind: LineKind): Group {
  if (["total", "subtotal", "guests", "orders", "service_charge", "discount", "tip"].includes(kind)) return "Basics";
  if (kind === "sales") return "Sales";
  if (kind === "payment" || kind === "delivery") return "Payments";
  return "Other";
}

/** Every choice a line can take, as one select value: kind, category, or where a payment lands. */
export function lineOptions(banks: { id: string; name: string }[]) {
  const sales = (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({ value: `sales:${c}`, label: CATEGORY_LABEL[c], group: "Sales" as Group }));
  const pay = [
    ...banks.map((b) => ({ value: `payment:bank:${b.id}`, label: `Paid → ${b.name}`, group: "Payments" as Group })),
    { value: "payment:bank", label: banks.length ? "Paid → bank (choose)" : "Paid → bank", group: "Payments" as Group },
    { value: "payment:cash", label: "Paid → cash", group: "Payments" as Group },
    { value: "delivery", label: KIND_LABEL.delivery, group: "Payments" as Group },
  ];
  const basics = (["total", "subtotal", "guests", "orders", "service_charge", "discount", "tip"] as const).map((k) => ({ value: k, label: KIND_LABEL[k], group: "Basics" as Group }));
  const other = (["voucher_sold", "voucher_used", "deposit_taken", "deposit_used", "ignore"] as const).map((k) => ({ value: k, label: KIND_LABEL[k], group: "Other" as Group }));
  return [...sales, ...pay, ...basics, ...other];
}

export function valueOf(l: Pick<SetupLine, "kind" | "category" | "settlesTo" | "bankAccountId">): string {
  if (l.kind === "sales") return `sales:${l.category ?? "other"}`;
  if (l.kind === "payment") return l.settlesTo === "cash" ? "payment:cash" : l.bankAccountId ? `payment:bank:${l.bankAccountId}` : "payment:bank";
  return l.kind;
}

export function applyValue<T extends SetupLine>(l: T, value: string): T {
  const [kind, a, b] = value.split(":");
  if (kind === "sales") return { ...l, kind: "sales", category: (a as Category) || "other", settlesTo: null, bankAccountId: null };
  if (kind === "payment") return { ...l, kind: "payment", category: null, settlesTo: a === "cash" ? "cash" : "bank", bankAccountId: a === "bank" && b ? b : null };
  return { ...l, kind: kind as LineKind, category: null, settlesTo: null, bankAccountId: null };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Add one read sample to the lines on screen. A line already there keeps the team's choice and
 * gains this sample's amount; a new line takes Bani's suggestion.
 */
export function addSample(lines: SetupLine[], sampleId: string, report: DiscoveredReport): SetupLine[] {
  const out = lines.map((l) => ({ ...l, amounts: { ...l.amounts } }));
  for (const d of report.lines) {
    const hit = out.find((l) => norm(l.printed) === norm(d.printed));
    if (hit) {
      hit.amounts[sampleId] = d.amount;
      // Saved lines (sure undefined), lines already in question, and the team's answers stand.
      if (hit.sure !== true || hit.answered) continue;
      // Reports that disagree about a line (or a doubtful read) turn it into a question, never a silent pick.
      const v = choiceValue(d), mine = valueOf(hit).replace(/^payment:bank:.*/, "payment:bank");
      if (v !== mine || !d.sure) {
        hit.sure = false;
        hit.alternatives = [...new Set([...(hit.alternatives ?? []), ...(v !== mine ? [v] : []), ...d.alternatives])].filter((x) => x !== mine).slice(0, 3);
      }
      continue;
    }
    out.push({ printed: d.printed, kind: d.kind, category: d.category, settlesTo: d.settlesTo, bankAccountId: null, amounts: { [sampleId]: d.amount },
      sure: d.sure, reason: d.reason, alternatives: d.alternatives });
  }
  return out;
}

export interface Question { printed: string; type: "what" | "where"; choices: string[] }

/**
 * What Bani still needs a person for: lines it isn't sure of, and (with more than one bank
 * account) which account a card or wallet payment lands in. Everything else it has decided.
 */
export function openQuestions(lines: SetupLine[], banks: { id: string }[]): Question[] {
  const qs: Question[] = [];
  for (const l of lines) {
    if (l.sure === false) {
      const mine = valueOf(l).replace(/^payment:bank:.*/, "payment:bank");
      qs.push({ printed: l.printed, type: "what", choices: [mine, ...(l.alternatives ?? []).filter((a) => a !== mine)].slice(0, 3) });
    } else if (l.kind === "payment" && l.settlesTo === "bank" && !l.bankAccountId && banks.length > 1) {
      qs.push({ printed: l.printed, type: "where", choices: [...banks.map((b) => `payment:bank:${b.id}`), "payment:cash"] });
    }
  }
  return qs;
}

/** The team's answer settles the line. */
export function answer(lines: SetupLine[], printed: string, value: string): SetupLine[] {
  return lines.map((l) => (l.printed === printed ? { ...applyValue(l, value), sure: true, answered: true } : l));
}

/** With one bank account there is nothing to ask: card and wallet payments land there. */
export function withOnlyBank(lines: SetupLine[], banks: { id: string }[]): SetupLine[] {
  if (banks.length !== 1) return lines;
  return lines.map((l) => (l.kind === "payment" && l.settlesTo === "bank" && !l.bankAccountId ? { ...l, bankAccountId: banks[0].id } : l));
}

export interface SampleCheck { ok: boolean; reason: string | null }

/**
 * Does a sample add up under this mapping? Payments (cash, cards, wallets, delivery and any
 * voucher or deposit redeemed) should equal the total; with tips on the report, the total
 * either way round is accepted. Without a total line, sales + service charge + discount is used.
 */
export function checkSample(lines: SetupLine[], sampleId: string, tolerance = 1): SampleCheck {
  const on = lines.filter((l) => sampleId in l.amounts && l.amounts[sampleId] != null);
  if (!on.length) return { ok: false, reason: "Nothing read" };
  const sum = (pred: (l: SetupLine) => boolean) => on.filter(pred).reduce((a, l) => a + (l.amounts[sampleId] as number), 0);
  const paid = sum((l) => l.kind === "payment" || l.kind === "delivery" || l.kind === "voucher_used" || l.kind === "deposit_used");
  if (!on.some((l) => l.kind === "payment" || l.kind === "delivery")) return { ok: false, reason: "No payments found" };
  const totalLine = on.find((l) => l.kind === "total");
  const total = totalLine
    ? (totalLine.amounts[sampleId] as number)
    : sum((l) => l.kind === "sales" || l.kind === "service_charge") - Math.abs(sum((l) => l.kind === "discount"));
  const tips = Math.abs(sum((l) => l.kind === "tip"));
  if ([paid, paid - tips, paid + tips].some((p) => Math.abs(p - total) <= tolerance)) return { ok: true, reason: null };
  const diff = paid - total;
  return { ok: false, reason: `Payments are ${Math.abs(Math.round(diff)).toLocaleString("en-US")} ${diff > 0 ? "more" : "less"} than total sales` };
}

/** Basics the report doesn't print: the portal hides these for this client. */
export function missingBasics(lines: SetupLine[]): ("total" | "guests" | "orders")[] {
  return (["total", "guests", "orders"] as const).filter((k) => !lines.some((l) => l.kind === k));
}
