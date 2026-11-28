import { describe, it, expect } from "vitest";
import { proposePayment } from "../../supabase/functions/chat-assistant/paymentActions";

const db = (tables: Record<string, any[]>) => ({
  from: (t: string) => { const q: any = new Proxy({}, { get: (_x, k) => k === "then" ? (r: any) => r({ data: tables[t] ?? [] }) : () => q }); return q; },
});
const data = {
  suppliers: [{ id: "s1", name: "SHUN WAH PRINTER COMPANY" }, { id: "s2", name: "KUNG KAI HONG CO., LTD." }],
  expense_bills: [{ id: "b1", supplier_id: "s1", vendor_name: "SHUN WAH PRINTER COMPANY", bill_number: "SI-53576", bill_date: "2026-11-26", total_amount: 890, paid_amount: 0, approval_status: "posted", currency: "HKD" }],
  invoices: [{ id: "i1", supplier_id: "s2", invoice_number: "SI26110546", invoice_date: "2026-11-17", total_amount: 312, amount_paid: 0, held_amount: 0, review_status: "Approved", payment_status: "unpaid", currency: null }],
  bank_accounts: [{ id: "hsbc", account_name: "HSBC Current", bank_name: "HSBC", linked_gl_account_id: "g", is_active: true }],
  owed_to_others: [{ id: "o1", name: "Kshitiz", kind: "staff", amount: 890, paid_amount: 0, owed_date: "2026-11-26", description: "SHUN WAH · SI-53576" }],
};

describe("payment card from chat", () => {
  it("staff paid a bill: settles the bill, owed to them", async () => {
    const r: any = await proposePayment({ payee: "Shun Wah", amount: 890, date: "2026-11-26", payment_method: "paid_by", paid_by_kind: "staff", paid_by_name: "Kshitiz" }, db(data), "t");
    expect(r.ok).toBe(true);
    expect(r.payload).toMatchObject({ p_method: "paid_by", p_account: null, p_amount: 890, p_paid_by_kind: "staff", p_paid_by_name: "Kshitiz" });
    expect(r.payload.p_items).toEqual([{ source: "bill", id: "b1", amount: 890, credits: [] }]);
    expect(r.detail).toContain("you then owe Kshitiz");
  });
  it("paid from the bank: picks the only bank account, invoice by supplier", async () => {
    const r: any = await proposePayment({ payee: "Kung Kai Hong", amount: 312, payment_method: "bank" }, db(data), "t");
    expect(r.payload).toMatchObject({ p_method: "bank_transfer", p_account: "hsbc" });
    expect(r.payload.p_items[0]).toMatchObject({ source: "supplier", id: "i1", amount: 312 });
  });
  it("asks who paid when it isn't said", async () => {
    const r: any = await proposePayment({ payee: "Shun Wah", payment_method: "paid_by" }, db(data), "t");
    expect(r.ok).toBe(false);
  });
  it("refuses more than is open", async () => {
    const r: any = await proposePayment({ payee: "Shun Wah", amount: 5000, payment_method: "cash" }, db(data), "t");
    expect(r.ok).toBe(false);
  });
  it("repays someone who paid for the business", async () => {
    const r: any = await proposePayment({ payee: "Kshitiz", amount: 890, payment_method: "repay", bank: "HSBC" }, db(data), "t");
    expect(r.payload.p_items).toEqual([{ source: "person", id: "o1", amount: 890, credits: [] }]);
    expect(r.title).toContain("Repay Kshitiz");
  });
  it("no bank account set up: says so", async () => {
    const r: any = await proposePayment({ payee: "Shun Wah", payment_method: "bank" }, db({ ...data, bank_accounts: [] }), "t");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No bank account");
  });
});
