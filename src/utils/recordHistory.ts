import { supabase } from "@/integrations/supabase/client";
import { formatMenuCurrency } from "@/utils/format";

/** One line of a record's History: when, what happened, and who did it (plain words, no ids). */
export type HistoryEvent = { at: string; text: string; who?: string | null };
export type HistoryKind = "bill" | "invoice" | "sales" | "journal";

const db = supabase as any;
const METHOD: Record<string, string> = { bank_transfer: "bank transfer", cash: "cash", cheque: "cheque", autopay: "autopay", card: "card", fps: "FPS" };
const BILL_EVENT: Record<string, string> = { uploaded: "Uploaded", draft: "Saved as draft", pending_review: "Sent for approval", approved: "Approved", rejected: "Rejected", posted: "Booked", void: "Undone", voided: "Undone", reversed: "Reversed", paid: "Paid", edited: "Edited" };
const SALES_FIELD: Record<string, string> = { total_sales: "total sales", subtotal: "subtotal", service_charge: "service charge", discount: "discount", cash: "cash", visa: "Visa", mastercard: "Mastercard", amex: "Amex", union_pay: "UnionPay", alipay: "Alipay", wechat: "WeChat", payme: "PayMe", jcb: "JCB", orders: "orders", guests: "guests", date: "date", venue: "venue", deliveroo: "Deliveroo", foodpanda: "foodpanda", keeta: "Keeta", receipt_file_url: "receipt", card_tips: "tips" };

/** Display names for user ids (profiles visible to this person); unknown ids are left out. */
async function names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const { data } = await db.from("profiles").select("user_id,display_name").in("user_id", list);
  return new Map(((data ?? []) as { user_id: string; display_name: string | null }[]).filter(p => p.display_name).map(p => [p.user_id, p.display_name as string]));
}

const money = (n: unknown) => formatMenuCurrency(Number(n) || 0);
const sortOldest = (e: HistoryEvent[]) => e.filter(x => x.at).sort((a, b) => a.at.localeCompare(b.at));

async function billHistory(tenantId: string, id: string): Promise<HistoryEvent[]> {
  const [{ data: bill }, { data: audit }, { data: pays }] = await Promise.all([
    db.from("expense_bills").select("created_at,created_by,posted_at,posted_by,reversed_at,reversed_by").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    db.from("expense_bill_audit").select("event_type,actor_id,actor_name,created_at").eq("tenant_id", tenantId).eq("bill_id", id),
    db.from("expense_bill_payments").select("payment_date,amount,payment_method,paid_by_name,created_by,created_at").eq("tenant_id", tenantId).eq("bill_id", id),
  ]);
  if (!bill) return [];
  const rows = (audit ?? []) as { event_type: string; actor_id: string | null; actor_name: string | null; created_at: string }[];
  const p = (pays ?? []) as { payment_date: string; amount: number; payment_method: string; paid_by_name: string | null; created_by: string | null; created_at: string }[];
  const who = await names([bill.created_by, bill.posted_by, bill.reversed_by, ...rows.map(r => r.actor_id), ...p.map(x => x.created_by)]);
  const has = (t: string) => rows.some(r => r.event_type === t);
  const out: HistoryEvent[] = rows.map(r => ({ at: r.created_at, text: BILL_EVENT[r.event_type] ?? r.event_type.replace(/_/g, " "), who: r.actor_name || (r.actor_id ? who.get(r.actor_id) : null) }));
  if (!has("uploaded")) out.push({ at: bill.created_at, text: "Added", who: bill.created_by ? who.get(bill.created_by) : null });
  if (bill.posted_at && !has("posted")) out.push({ at: bill.posted_at, text: "Booked", who: bill.posted_by ? who.get(bill.posted_by) : null });
  if (bill.reversed_at && !has("reversed")) out.push({ at: bill.reversed_at, text: "Reversed", who: bill.reversed_by ? who.get(bill.reversed_by) : null });
  for (const x of p) out.push({ at: x.created_at, text: `Paid ${money(x.amount)} on ${x.payment_date} · ${x.paid_by_name ? `by ${x.paid_by_name}` : METHOD[x.payment_method] ?? x.payment_method}`, who: x.created_by ? who.get(x.created_by) : null });
  return sortOldest(out);
}

async function invoiceHistory(tenantId: string, id: string): Promise<HistoryEvent[]> {
  const [{ data: inv }, { data: allocs }, { data: photos }, { data: audit }] = await Promise.all([
    db.from("invoices").select("created_at,entered_by,approved_at,approved_by,voided_at,voided_by").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    db.from("payment_allocations").select("amount_allocated,created_at,payments(payment_date,payment_method,paid_by_name,created_by)").eq("tenant_id", tenantId).eq("invoice_id", id),
    db.from("invoice_delivery_photos").select("taken_at,taken_by,taken_by_name").eq("tenant_id", tenantId).eq("invoice_id", id),
    db.from("audit_log").select("action,user_id,user_display_name,created_at").eq("tenant_id", tenantId).eq("entity_type", "invoice").eq("entity_id", id),
  ]);
  if (!inv) return [];
  const a = (allocs ?? []) as { amount_allocated: number; created_at: string; payments: { payment_date: string; payment_method: string; paid_by_name: string | null; created_by: string | null } | null }[];
  const ph = (photos ?? []) as { taken_at: string; taken_by: string | null; taken_by_name: string | null }[];
  const au = (audit ?? []) as { action: string; user_id: string | null; user_display_name: string | null; created_at: string }[];
  const who = await names([inv.entered_by, inv.approved_by, inv.voided_by, ...a.map(x => x.payments?.created_by), ...ph.map(x => x.taken_by)]);
  const out: HistoryEvent[] = [{ at: inv.created_at, text: "Booked", who: inv.entered_by ? who.get(inv.entered_by) : null }];
  if (inv.approved_at && Math.abs(Date.parse(inv.approved_at) - Date.parse(inv.created_at)) > 60_000) out.push({ at: inv.approved_at, text: "Approved", who: inv.approved_by ? who.get(inv.approved_by) : null });
  if (ph.length) out.push({ at: ph[0].taken_at, text: `${ph.length} delivery photo${ph.length === 1 ? "" : "s"} added`, who: ph[0].taken_by_name || (ph[0].taken_by ? who.get(ph[0].taken_by) : null) });
  for (const x of au) if (x.action === "attachment_repair") out.push({ at: x.created_at, text: "Invoice file attached", who: x.user_display_name });
  for (const x of a) out.push({ at: x.created_at, text: `Paid ${money(x.amount_allocated)}${x.payments ? ` on ${x.payments.payment_date} · ${x.payments.paid_by_name ? `by ${x.payments.paid_by_name}` : METHOD[x.payments.payment_method] ?? x.payments.payment_method}` : ""}`, who: x.payments?.created_by ? who.get(x.payments.created_by) : null });
  if (inv.voided_at) out.push({ at: inv.voided_at, text: "Voided", who: inv.voided_by ? who.get(inv.voided_by) : null });
  return sortOldest(out);
}

async function salesHistory(tenantId: string, id: string): Promise<HistoryEvent[]> {
  const [{ data: rec }, { data: audit }] = await Promise.all([
    db.from("sales_records").select("created_at").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    db.from("audit_log").select("action,user_display_name,details,created_at").eq("tenant_id", tenantId).eq("entity_type", "sales_record").eq("entity_id", id),
  ]);
  const au = (audit ?? []) as { action: string; user_display_name: string | null; details: { changed?: string[] } | null; created_at: string }[];
  const out: HistoryEvent[] = au.map(x => {
    if (x.action === "insert") return { at: x.created_at, text: "Recorded", who: x.user_display_name };
    if (x.action === "attach_receipt") return { at: x.created_at, text: "Receipt attached", who: x.user_display_name };
    const fields = (x.details?.changed ?? []).map(k => SALES_FIELD[k]).filter(Boolean);
    return { at: x.created_at, text: fields.length ? `Changed ${fields.slice(0, 3).join(", ")}${fields.length > 3 ? ` and ${fields.length - 3} more` : ""}` : "Edited", who: x.user_display_name };
  });
  if (rec && !au.some(x => x.action === "insert")) out.push({ at: rec.created_at, text: "Recorded" });
  return sortOldest(out);
}

async function journalHistory(tenantId: string, id: string): Promise<HistoryEvent[]> {
  const [{ data: je }, { data: audit }] = await Promise.all([
    db.from("journal_entries").select("created_at,created_by,posted_at,status").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    db.from("ledger_audit_log").select("event_type,user_display_name,notes,created_at").eq("tenant_id", tenantId).eq("journal_entry_id", id),
  ]);
  if (!je) return [];
  const who = await names([je.created_by]);
  const au = (audit ?? []) as { event_type: string; user_display_name: string | null; notes: string | null; created_at: string }[];
  const out: HistoryEvent[] = [{ at: je.created_at, text: je.created_by ? "Created" : "Created by Bani from the source record", who: je.created_by ? who.get(je.created_by) : null }];
  if (je.posted_at && !au.some(x => /post/.test(x.event_type))) out.push({ at: je.posted_at, text: "Posted", who: je.created_by ? who.get(je.created_by) : null });
  for (const x of au) out.push({ at: x.created_at, text: x.event_type === "journal_entry_edited" ? "Edited" : x.event_type.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()), who: x.user_display_name });
  return sortOldest(out);
}

export function loadRecordHistory(kind: HistoryKind, tenantId: string, id: string): Promise<HistoryEvent[]> {
  if (kind === "bill") return billHistory(tenantId, id);
  if (kind === "invoice") return invoiceHistory(tenantId, id);
  if (kind === "sales") return salesHistory(tenantId, id);
  return journalHistory(tenantId, id);
}

/** "28 Nov 16:52", Hong Kong time. */
export function historyTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
}

/** One line: "Approved · 28 Nov 16:50 · Prashant". */
export function historyLine(e: HistoryEvent): string {
  return [e.text, historyTime(e.at), e.who].filter(Boolean).join(" · ");
}
