import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { payoutFeeOver, savePayoutBatches, type PayoutBatch } from "@/utils/payoutImport";

const batch = (o: Partial<PayoutBatch> = {}): PayoutBatch => ({
  merchant_number: "M1", merchant_label: "", transaction_date: "2026-11-01", settlement_date: "2026-11-02", gross_amount: 1000, fee_amount: 20,
  points_offset: 0, bank_transfer_fee: 0, adjustments: 0, frozen_amount: 0, net_settlement: 980, count: 1, transactions: [], transactions_flagged: 0,
  fee_variance: 0, audit_status: "ok", audit_note: "",
  lines: [{ payment_type: "visa", payment_type_label: "Visa", count: 1, gross_amount: 1000, fee_amount: 20, net_amount: 980, expected_fee: 12, fee_variance: 8, audit_status: "rate_off" }], ...o,
});
const processor = { id: "p1", name: "KPay", type: "kpay", is_active: true, sort_order: 0, notes: "" };

describe("Bani chat bank statements and card payouts", () => {
  it("sums fees charged above the agreed rate", () => {
    expect(payoutFeeOver([batch(), batch({ lines: [{ ...batch().lines[0], fee_variance: 0.004 }] })])).toBe(8);
  });

  it("never saves a payout with an unknown merchant or an unread currency", async () => {
    await expect(savePayoutBatches({ tenantId: "t", processor, importId: "i", batches: [batch()], merchants: [], currency: "HKD" })).rejects.toThrow(/Unmapped merchant M1/);
    await expect(savePayoutBatches({ tenantId: "t", processor, importId: "i", batches: [batch()], merchants: [], currency: "" })).rejects.toThrow(/currency/);
  });

  it("uses Cash's own loaders and never posts", () => {
    expect(readFileSync("src/components/finance/cash/BankStatementUpload.tsx", "utf8")).toContain("loadStatementFile(");
    expect(readFileSync("src/components/finance/payments/ParseSettlementModal.tsx", "utf8")).toContain("savePayoutBatches(");
    expect(readFileSync("src/components/finance/payments/ImportsTab.tsx", "utf8")).toContain("uploadPayoutFile(");
    const chat = readFileSync("src/components/assistant/ChatCashUpload.tsx", "utf8");
    expect(chat).toContain("loadStatementFile(");
    expect(chat).toContain("savePayoutBatches(");
    expect(chat).toContain("isAdmin && !isPreviewActive");
    expect(chat).not.toMatch(/journal|post_|finance_entry/);
    const lib = readFileSync("src/utils/bankStatementImport.ts", "utf8");
    expect(lib).toContain("overlappingStatement(tenantId, account.id, start, end)");
    expect(lib).toContain("pocketAddsUp(p)");
    const server = readFileSync("supabase/functions/chat-assistant/floatingFiles.ts", "utf8");
    expect(server).toContain('name: "open_cash_upload"');
  });
});
