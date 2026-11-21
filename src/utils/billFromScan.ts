import type { ScannedBill } from "@/components/finance/bills/BillScanner";
import type { ExpenseBill, ExpenseBillAllocation } from "@/hooks/useExpenseBills";
import { supabase } from "@/integrations/supabase/client";
import { matchExpenseSupplier, type MeterAccount } from "@/utils/expenseSupplierAccounts";
import { proposedCategoryAccount } from "@/utils/expenses";

export type BillLookups = {
  suppliers: { id: string; name: string; address?: string | null }[];
  meters: MeterAccount[];
  aliases: { supplier_id: string; alias: string }[];
  venues: { id: string; name: string }[];
  categories: { id: string; name: string; default_account_id: string | null }[];
  accounts: { id: string; code: string; name?: string }[];
};

const normAcct = (s: string | null | undefined) => (s || "").replace(/\s+/g, "").toLowerCase();

/**
 * A scanned bill as an unsaved draft: supplier/meter match, category → account, venue.
 * The one mapping used by Expenses › Bills and the Bani chat, so both agree.
 */
export function billDraftFromScan(s: ScannedBill, l: BillLookups): { header: Partial<ExpenseBill>; allocations: ExpenseBillAllocation[]; matched: boolean } {
  const match = matchExpenseSupplier(s, l.meters, l.suppliers, l.aliases);
  const matched = "supplier_id" in match ? l.suppliers.find(sp => sp.id === match.supplier_id) : undefined;
  const ven = l.venues.find(v => v.name.toLowerCase() === (s.venue || "").toLowerCase());
  const bf = Number(s.brought_forward || 0);
  const stTotal = s.statement_total === null || s.statement_total === undefined ? null : Number(s.statement_total);
  const meta: Record<string, any> = {};
  if (s.account_number) meta.account_number = s.account_number;
  if (s.consumption) meta.consumption = s.consumption;
  if (s.statement_check) meta.statement_check = s.statement_check;
  if (s.service_address) meta.service_address = s.service_address;
  if (match.kind === "question") meta.bani_question = `${s.vendor_name}: create this new supplier?`;
  if (match.kind === "company" && s.account_number) meta.bani_question = `${s.vendor_name} · a/c ${s.account_number}: which venues does it cover?`;
  const header: Partial<ExpenseBill> = {
    supplier_id: matched?.id || null,
    supplier_account_id: match.kind === "account" ? match.account_id : null,
    vendor_name: s.vendor_name || null,
    bill_number: s.bill_number || null,
    bill_date: s.bill_date || new Date().toISOString().slice(0, 10),
    due_date: s.due_date || null,
    service_period_start: s.service_period_start || null,
    service_period_end: s.service_period_end || null,
    venue: ven?.name || s.venue || null,
    venue_id: ven?.id || null,
    currency: s.currency || "HKD",
    subtotal: s.subtotal || 0,
    tax_amount: s.tax_amount || 0,
    total_amount: s.total_amount || (s.subtotal + s.tax_amount),
    notes: s.notes || null,
    attachment_url: s.attachment_url || null,
    attachment_path: s.attachment_path || null,
    approval_status: "draft",
    brought_forward: bf,
    statement_total: stTotal,
    meta,
  } as Partial<ExpenseBill>;
  const allocations = (s.allocations.length ? s.allocations : [{ expense_category: "Other Operating Expenses", amount: s.subtotal || s.total_amount, notes: "" }]).map((a, i) => ({
    line_no: i + 1,
    expense_category: a.expense_category,
    supplier_account_id: l.meters.find(m => m.supplier_id === matched?.id && normAcct(m.account_number) === normAcct(("account_number" in a ? String(a.account_number) : "") || s.account_number))?.id ?? null,
    account_id: l.categories.find(c => c.name.toLowerCase() === a.expense_category.toLowerCase())?.default_account_id || proposedCategoryAccount(a.expense_category, l.accounts) || null,
    venue: ven?.name || s.venue || null,
    department: null,
    amount: a.amount,
    tax_treatment: "none" as const,
    tax_amount: 0,
    notes: a.notes || null,
  }));
  return { header, allocations, matched: !!matched };
}

/** Why a bill can't be settled in chat; empty when it can. Anything here opens Expenses › Bills. */
export function billNeedsFullScreen(s: ScannedBill, d: ReturnType<typeof billDraftFromScan>, contract: boolean): string {
  if (!d.matched || d.header.meta?.bani_question) return "I don't know this supplier yet";
  if (s.suggested_document_type === "procurement_invoice") return "This looks like a stock invoice";
  if (contract || (s as { contract_terms?: unknown }).contract_terms) return "This is a contract bill";
  if (Number(s.brought_forward || 0) !== 0 || s.statement_check) return "This statement carries a balance";
  if (!d.header.venue_id) return "I couldn't tell which venue";
  const lines = d.allocations.reduce((n, a) => n + Number(a.amount || 0), 0);
  const expected = Number(d.header.subtotal || 0) || Number(d.header.total_amount || 0) - Number(d.header.tax_amount || 0);
  if (Math.abs(lines - expected) >= 0.01) return "The lines don't add up to the bill";
  return "";
}

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = reject;
  r.readAsDataURL(file);
});

/** Same read as Expenses › Bills: keep the file in bill-attachments, then parse-bill. Nothing is saved. */
export async function readBillFiles(list: File[]): Promise<ScannedBill> {
  const payload = await Promise.all(list.map(async f => ({ base64: await fileToBase64(f), mimeType: /\.eml$/i.test(f.name) ? "message/rfc822" : f.type || "application/octet-stream" })));
  const auth = (await supabase.auth.getUser()).data.user?.id;
  let attachment_url: string | undefined;
  let attachment_path: string | undefined;
  try {
    const first = list[0];
    const ext = first.name.split(".").pop() || "bin";
    const path = `${auth || "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await supabase.storage.from("bill-attachments").upload(path, first, { contentType: first.type, upsert: false });
    if (!up.error) {
      attachment_path = up.data.path;
      const signed = await supabase.storage.from("bill-attachments").createSignedUrl(up.data.path, 60 * 60 * 24 * 7);
      attachment_url = signed.data?.signedUrl;
    }
  } catch (e) {
    console.warn("Attachment upload failed (non-fatal):", e);
  }
  const { data, error } = await supabase.functions.invoke("parse-bill", { body: { files: payload } });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Scan failed");
  const parsed = data.data as ScannedBill;
  parsed.attachment_url = attachment_url;
  parsed.attachment_path = attachment_path;
  return parsed;
}

/** Load what billDraftFromScan needs, for the active tenant only. */
export async function loadBillLookups(tenantId: string): Promise<BillLookups> {
  const [s, a, v, c, meters, aliases] = await Promise.all([
    supabase.from("suppliers").select("id,name,account_number,vendor_type").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase.from("chart_of_accounts").select("id,code,name,account_type").eq("tenant_id", tenantId).order("code"),
    supabase.from("venues").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase.from("expense_categories").select("id,name,default_account_id").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase.from("supplier_accounts").select("*").eq("tenant_id", tenantId),
    supabase.from("expense_supplier_aliases").select("*").eq("tenant_id", tenantId),
  ]);
  const err = [s, a, v, c, meters, aliases].find(r => r.error)?.error;
  if (err) throw err;
  return {
    suppliers: (s.data ?? []) as BillLookups["suppliers"],
    accounts: (a.data ?? []) as BillLookups["accounts"],
    venues: (v.data ?? []) as BillLookups["venues"],
    categories: (c.data ?? []) as BillLookups["categories"],
    meters: (meters.data ?? []).map((m: any) => ({ ...m, covers: Array.isArray(m.covers) ? m.covers.filter((x: any) => !!x && typeof x === "object" && !Array.isArray(x) && typeof x.venue_id === "string") : [] })) as MeterAccount[],
    aliases: (aliases.data ?? []) as BillLookups["aliases"],
  };
}

export type RegularCostMatch = { name: string; expected: number; contract: boolean; estimate: boolean } | null;

/**
 * Is this bill one of the tenant's regular costs? Read-only: the active rule for this supplier,
 * or this month's waiting accrual estimate for the meter account. Saving a bill already
 * replaces the estimate through the normal meter coverage; contracts stay on the contract path.
 */
export async function findRegularCost(tenantId: string, header: Partial<ExpenseBill>): Promise<RegularCostMatch> {
  const supplierId = header.supplier_id;
  const meter = (header as { supplier_account_id?: string | null }).supplier_account_id ?? null;
  if (!supplierId) return null;
  const month = `${String(header.service_period_start || header.bill_date || "").slice(0, 7)}-01`;
  const [rules, drafts] = await Promise.all([
    supabase.from("expense_recurring_rules").select("id,name,expected_amount,is_contract,cadence,active,status").eq("tenant_id", tenantId).eq("supplier_id", supplierId).eq("active", true),
    meter && /^\d{4}-\d{2}-01$/.test(month)
      ? supabase.from("expense_accrual_drafts").select("amount,kind,status,recurring_rule_id").eq("tenant_id", tenantId).eq("supplier_account_id", meter).eq("month_start", month).eq("status", "waiting")
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (rules.error) throw rules.error;
  if (drafts.error) throw drafts.error;
  const live = (rules.data ?? []).filter((r: any) => r.status !== "ended" && r.status !== "cancelled");
  const contract = live.find((r: any) => r.is_contract);
  if (contract) return { name: contract.name, expected: Number(contract.expected_amount) || 0, contract: true, estimate: false };
  const d = (drafts.data ?? [])[0] as any;
  if (d) return { name: live.find((r: any) => r.id === d.recurring_rule_id)?.name ?? "Regular cost", expected: Number(d.amount) || 0, contract: false, estimate: d.kind === "estimate" };
  const rule = live.find((r: any) => (r.cadence || "monthly") === "monthly") ?? live[0];
  return rule ? { name: rule.name, expected: Number(rule.expected_amount) || 0, contract: false, estimate: false } : null;
}
