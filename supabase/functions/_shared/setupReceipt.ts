// Pure rules for clients whose sales reports are set up line by line (sales_report_lines without
// fixed fields). Reading, the balance check and the independent second-read comparison all work on
// the client's own lines, with the same standard as receiptAutoPost.ts. No accounting here.

export type SetupKind =
  | "total" | "subtotal" | "guests" | "orders" | "service_charge" | "discount" | "tip"
  | "sales" | "payment" | "delivery" | "voucher_sold" | "voucher_used" | "deposit_taken" | "deposit_used" | "ignore";
export interface SetupLineDef { printed: string; kind: SetupKind }
export interface ReadLine { printed: string; amount: number | null; kind: SetupKind | null; known: boolean }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const close = (a: number, b: number) => Math.abs(a - b) <= 0.01;

/** A client is read line by line once it has a setup and none of it names KHAMBU-style fixed fields. */
export function isSetupMode(lines: { legacy_field: string | null; is_active: boolean }[]): boolean {
  const active = lines.filter((l) => l.is_active);
  return active.length > 0 && active.every((l) => !l.legacy_field);
}

/** The setup that applies to a venue: its own lines, else the client's all-venues lines. */
export function linesForVenue<T extends { venue_id: string | null }>(all: T[], venueId: string | null): T[] {
  const own = venueId ? all.filter((l) => l.venue_id === venueId) : [];
  return own.length ? own : all.filter((l) => l.venue_id === null);
}

export function setupReadPrompt(known: SetupLineDef[], venues: string[]): string {
  return `You read one restaurant daily sales report (POS Z report). Read ONLY what is printed.
Return ONLY JSON: {"date":"YYYY-MM-DD (business day; for a From/To range use From)","rawPrintedDate":"as printed","printedWeekday":"as printed or null",
"venue":"${venues.length ? `one of: ${venues.join(", ")}, or \\"\\" if none matches` : "as printed"}","reportNumber":"as printed or \\"\\"",
"lines":[{"printed":"label as printed (translate non-English to English)","amount":number or null}]}
This client's report normally prints these lines (use these exact labels when they appear): ${known.map((k) => k.printed).join(" | ")}.
Also list any other line with an amount or count, with its own label. Never invent lines or totals; missing is null, never 0 unless printed.
Amounts are plain numbers with the printed sign. Two-digit years: '26 means 2026.`;
}

/** Match a read to the setup: known labels take their setup meaning; anything else is an unknown line. */
export function matchRead(raw: unknown, setup: SetupLineDef[]): { date: string | null; rawPrintedDate: string; printedWeekday: string | null; venue: string; reportNumber: string; lines: ReadLine[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const byName = new Map(setup.map((s) => [norm(s.printed), s]));
  const seen = new Set<string>();
  const lines: ReadLine[] = [];
  for (const item of Array.isArray(r.lines) ? r.lines.slice(0, 120) : []) {
    const l = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const printed = String(l.printed ?? "").replace(/[\u0000-\u001f`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!printed || seen.has(norm(printed))) continue;
    seen.add(norm(printed));
    const def = byName.get(norm(printed));
    lines.push({ printed: def?.printed ?? printed, amount: num(l.amount), kind: def?.kind ?? null, known: !!def });
  }
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  return {
    date, rawPrintedDate: String(r.rawPrintedDate ?? ""), printedWeekday: r.printedWeekday ? String(r.printedWeekday) : null,
    venue: String(r.venue ?? "").trim().slice(0, 120), reportNumber: String(r.reportNumber ?? "").trim().slice(0, 60), lines,
  };
}

/** The day's usual figures from its lines, so Overview, Trends and Targets work unchanged. */
export function basicsFromLines(lines: ReadLine[]) {
  const sum = (k: SetupKind) => {
    const xs = lines.filter((l) => l.kind === k && l.amount != null);
    return xs.length ? xs.reduce((a, l) => a + (l.amount as number), 0) : null;
  };
  const sales = sum("sales"), svc = sum("service_charge") ?? 0, disc = -Math.abs(sum("discount") ?? 0);
  const total = sum("total") ?? (sales != null ? sales + svc + disc : null);
  const subtotal = sum("subtotal") ?? (total != null ? total - svc - disc : null);
  return {
    totalSales: total, subtotal, serviceCharge: svc, discount: disc,
    guests: sum("guests") ?? 0, orders: sum("orders") ?? 0, cardTips: -Math.abs(sum("tip") ?? 0),
    vouchersSold: sum("voucher_sold") ?? 0, vouchersUsed: sum("voucher_used") ?? 0,
    depositsTaken: sum("deposit_taken") ?? 0, depositsUsed: sum("deposit_used") ?? 0,
  };
}

/** Same standard as KHAMBU's receipts: the right lines, payments equal total sales, nothing unknown. */
export function setupProblems(lines: ReadLine[]): string[] {
  const p: string[] = [];
  const unknown = lines.filter((l) => !l.known && l.amount != null && l.amount !== 0);
  if (unknown.length) p.push(`New on this report: ${unknown.map((l) => l.printed).join(", ")}. Map ${unknown.length === 1 ? "it" : "them"} in the sales report setup`);
  if (lines.some((l) => l.known && l.amount != null && !Number.isFinite(l.amount))) { p.push("Invalid amounts"); return p; }
  const b = basicsFromLines(lines);
  if (b.totalSales == null || b.totalSales <= 0) { p.push("Total sales is zero, negative or missing"); return p; }
  const paid = lines.filter((l) => ["payment", "delivery", "voucher_used", "deposit_used"].includes(l.kind ?? "") && l.amount != null)
    .reduce((a, l) => a + (l.amount as number), 0);
  if (!lines.some((l) => l.kind === "payment" || l.kind === "delivery")) p.push("No payments on the report");
  else {
    const tips = Math.abs(b.cardTips);
    if (![paid, paid - tips, paid + tips].some((x) => close(x, b.totalSales as number))) p.push("Payments do not add up to total sales");
  }
  return p;
}

/** Line-by-line comparison with an independent second read: every amount must agree. */
export function setupMismatches(first: ReturnType<typeof matchRead>, second: ReturnType<typeof matchRead> | null): string[] {
  if (!second) return ["Independent check could not read the receipt"];
  const m: string[] = [];
  if ((second.date ?? "") !== (first.date ?? "")) m.push(`Date read as ${second.date ?? "unclear"} on the second check`);
  if (second.venue && second.venue !== first.venue) m.push(`Venue read as ${second.venue} on the second check`);
  const other = new Map(second.lines.map((l) => [norm(l.printed), l]));
  for (const l of first.lines) {
    if (l.amount == null || l.amount === 0) continue;
    const s = other.get(norm(l.printed));
    if (!s || s.amount == null) m.push(`${l.printed} not found on the second check`);
    else if (!close(Math.abs(s.amount), Math.abs(l.amount))) m.push(`${l.printed} read as ${s.amount} on the second check`);
  }
  for (const s of second.lines) {
    if (s.amount != null && s.amount !== 0 && !first.lines.some((l) => norm(l.printed) === norm(s.printed))) m.push(`${s.printed} only found on the second check`);
  }
  return m;
}
