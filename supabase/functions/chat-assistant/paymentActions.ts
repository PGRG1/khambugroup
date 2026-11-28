// Recording a payment from chat through a Bani confirmation card: "Shun Wah 890 paid cash by Kshitiz on 26 Nov",
// "paid Lucky Port 5,800 from HSBC", "repay the director 5,000 from the bank". The proposal finds the open bills and
// invoices (or what is owed to a person) for that payee, oldest first; Confirm records it as the signed-in user through
// finance_record_owed_payment, the same server path as Finance › Payables › Pay, which rechecks every balance.

const norm = (s: string) => s.toLowerCase().replace(/\b(limited|ltd|co|company|the)\b/g, " ").replace(/[^a-z0-9一-鿿]+/g, " ").trim();
const matches = (name: string | null | undefined, wanted: string) => {
  const a = norm(name ?? ""), b = norm(wanted);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};
const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => `HK$${(cents(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KINDS = ["staff", "director", "group_company", "other"] as const;
const KIND_LABEL: Record<string, string> = { staff: "staff", director: "director", group_company: "group company", other: "" };
const OWED_IN: Record<string, string> = { staff: "Other payables", director: "Director's loan", group_company: "Due to related companies", other: "Other payables" };

export const PAYMENT_KIND_HELP = "record_payment = record that something owed was paid (payee, amount, date, payment_method bank|cash|paid_by|repay, for paid_by also paid_by_kind staff|director|group_company|other and paid_by_name, optional bank = bank account name, optional reference). Use paid_by when staff, the director, a group company or anyone else paid the supplier for the business; use repay when the business pays back someone who paid for it (payee = that person). Bani finds the open bills/invoices for the payee, oldest first.";

type Item = { source: "supplier" | "bill" | "person"; id: string; amount: number; credits: unknown[]; label: string; date: string };

export async function proposePayment(args: any, admin: any, tenantId: string) {
  const payee = typeof args.payee === "string" ? args.payee.trim().slice(0, 120) : "";
  const method = ["bank", "cash", "paid_by", "repay"].includes(args.payment_method) ? args.payment_method as string : "";
  const amount = Number(args.amount);
  if (!payee || !method) return { ok: false, error: "record_payment needs who was paid (payee) and how (payment_method). Ask only for what is missing." };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
  const date = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) && args.date <= today ? args.date : today;
  const kind = KINDS.find((k) => k === args.paid_by_kind) ?? null;
  const paidByName = typeof args.paid_by_name === "string" ? args.paid_by_name.trim().slice(0, 120) : "";
  if (method === "paid_by" && (!kind || !paidByName)) return { ok: false, error: "Ask who paid: their name and whether they are staff, the director, a group company or someone else." };

  // What is open for this payee, oldest first.
  let open: Item[] = [];
  if (method === "repay") {
    const { data } = await admin.from("owed_to_others").select("id,name,kind,amount,paid_amount,owed_date,description").eq("tenant_id", tenantId).eq("status", "owing").order("owed_date");
    open = ((data ?? []) as any[]).filter((o) => matches(o.name, payee) || (norm(payee).includes("director") && o.kind === "director"))
      .map((o) => ({ source: "person", id: o.id, amount: Number(o.amount) - Number(o.paid_amount), credits: [], label: `${o.name} · ${o.description ?? "paid for the business"}`, date: o.owed_date }));
  } else {
    const [{ data: sups }, { data: bills }] = await Promise.all([
      admin.from("suppliers").select("id,name").eq("tenant_id", tenantId),
      admin.from("expense_bills").select("id,supplier_id,vendor_name,bill_number,bill_date,total_amount,paid_amount,approval_status,currency").eq("tenant_id", tenantId).eq("approval_status", "posted"),
    ]);
    const supIds = ((sups ?? []) as any[]).filter((s) => matches(s.name, payee)).map((s) => s.id);
    const supName = new Map(((sups ?? []) as any[]).map((s) => [s.id, s.name]));
    const { data: invs } = supIds.length ? await admin.from("invoices").select("id,supplier_id,invoice_number,invoice_date,total_amount,amount_paid,held_amount,review_status,payment_status,currency").eq("tenant_id", tenantId).in("supplier_id", supIds).eq("review_status", "Approved") : { data: [] };
    const base = (c: string | null) => !c || c.toUpperCase() === "HKD";
    for (const i of (invs ?? []) as any[]) {
      const due = Number(i.total_amount) - Number(i.amount_paid ?? 0) - Number(i.held_amount ?? 0);
      if (due > 0.005 && i.payment_status !== "voided" && i.invoice_date <= date && base(i.currency)) open.push({ source: "supplier", id: i.id, amount: due, credits: [], label: `${supName.get(i.supplier_id)} · ${i.invoice_number ?? "invoice"}`, date: i.invoice_date });
    }
    for (const b of (bills ?? []) as any[]) {
      if (!(supIds.includes(b.supplier_id) || matches(b.vendor_name, payee))) continue;
      const due = Number(b.total_amount) - Number(b.paid_amount ?? 0);
      if (due > 0.005 && b.bill_date <= date && base(b.currency)) open.push({ source: "bill", id: b.id, amount: due, credits: [], label: `${b.vendor_name ?? "Bill"} · ${b.bill_number ?? "bill"}`, date: b.bill_date });
    }
  }
  open.sort((a, b) => a.date.localeCompare(b.date));
  if (!open.length) return { ok: false, error: method === "repay" ? `Nothing is owed to ${payee}.` : `Nothing booked is open for ${payee} on or before ${date}. If the bill is not booked yet, book it first.` };

  // One item with exactly that amount wins; otherwise oldest first up to the amount (or everything when no amount was said).
  const total = open.reduce((n, i) => n + cents(i.amount), 0);
  let want = Number.isFinite(amount) && amount > 0 ? cents(amount) : total;
  if (want > total) return { ok: false, error: `Only ${money(total / 100)} is open for ${payee}, less than ${money(want / 100)}. Ask what the rest was for.` };
  const exact = open.find((i) => cents(i.amount) === want);
  const items: Item[] = [];
  for (const i of exact ? [exact] : open) { if (want <= 0) break; const a = Math.min(want, cents(i.amount)); items.push({ ...i, amount: a / 100 }); want -= a; }
  const paidTotal = items.reduce((n, i) => n + cents(i.amount), 0) / 100;

  // Where the money came from.
  let account: string | null = null, from = "";
  const pMethod = method === "cash" ? "cash" : method === "paid_by" ? "paid_by" : method === "repay" && args.from === "cash" ? "cash" : "bank_transfer";
  if (pMethod === "bank_transfer") {
    const { data: banks } = await admin.from("bank_accounts").select("id,account_name,bank_name,linked_gl_account_id,is_active").eq("tenant_id", tenantId).eq("is_active", true);
    const linked = ((banks ?? []) as any[]).filter((b) => b.linked_gl_account_id && !/^test/i.test(b.account_name ?? ""));
    const hint = typeof args.bank === "string" ? args.bank : "";
    const bank = (hint && linked.find((b) => matches(b.account_name, hint) || matches(b.bank_name, hint))) || (linked.length === 1 ? linked[0] : null);
    if (!bank) return linked.length ? { ok: false, needs_choice: true, candidates: linked.map((b) => b.account_name || b.bank_name), note: "Ask which bank account it was paid from; offer these as suggest_replies chips." }
      : { ok: false, error: "No bank account is set up for this business yet. Say it can be recorded as cash or paid by someone, or set up the bank account in Finance › Cash first." };
    account = bank.id; from = `from ${bank.account_name || bank.bank_name}`;
  } else if (pMethod === "cash") from = "in cash";
  else from = `by ${paidByName}${KIND_LABEL[kind!] ? ` (${KIND_LABEL[kind!]})` : ""}`;

  const payload = {
    p_date: date, p_method: pMethod, p_account: account, p_amount: paidTotal,
    p_reference: typeof args.reference === "string" ? args.reference.slice(0, 120) : "",
    p_items: items.map(({ source, id, amount }) => ({ source, id, amount, credits: [] })),
    p_paid_by_kind: pMethod === "paid_by" ? kind : null, p_paid_by_name: pMethod === "paid_by" ? paidByName : null,
  };
  const who = method === "repay" ? items[0].label.split(" · ")[0] : items[0].label.split(" · ")[0];
  const title = (method === "repay" ? `Repay ${who} ${money(paidTotal)} ${from}` : `Record payment: ${who} ${money(paidTotal)} paid ${from}`).slice(0, 200);
  const lines = items.map((i) => `${i.label.split(" · ").slice(1).join(" · ") || i.label} ${money(i.amount)}`).join(", ");
  const after = pMethod === "paid_by" ? ` · you then owe ${paidByName} ${money(paidTotal)} (${OWED_IN[kind!]})` : pMethod === "bank_transfer" ? " · not in the bank yet; Bani matches it when the statement comes in" : "";
  const detail = `${date} · ${lines}${after}`.slice(0, 500);
  return { ok: true, payload, title, detail };
}

export async function confirmPayment(p: any, userClient: any, tenantId: string) {
  const { error } = await userClient.rpc("finance_record_owed_payment", { p_tenant: tenantId, ...p });
  if (error) return { status: 409, body: { error: error.message } };
  return { status: 200, body: { ok: true, message: "Payment recorded." } };
}
