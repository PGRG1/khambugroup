import { describe, it, expect } from "vitest";
import { recentBaniTurns, honestBaniAnswer, baniModel } from "../../supabase/functions/_shared/baniConversation";
import { receiptReviewReasons } from "../../supabase/functions/_shared/receiptIntakePolicy";
import { salesOutcomeMessage } from "../utils/salesSaveResult";

describe("honest conversational outcomes", () => {
  const none = { cardEmitted: false, writeCompleted: false };
  it("removes repeated introduction while preserving the answer", () => expect(honestBaniAnswer("Hi, I'm Bani, your Finance Team. Sales increased.", none)).toBe("Sales increased."));
  it("does not promise unsupported cards", () => expect(honestBaniAnswer("I prepared a card for that.", none)).toContain("No action card was created"));
  it("retains a real supported proposal", () => expect(honestBaniAnswer("I prepared a card for that.", { ...none, cardEmitted: true })).toBe("I prepared a card for that."));
  it("rejects unsupported save claims", () => expect(honestBaniAnswer("I've saved those sales.", none)).toContain("No financial change was confirmed"));
  it("keeps contextual date/document intent beyond eight turns", () => {
    const turns = [{ role: "user" as const, content: "Caliente 12 October receipt.pdf" }, ...Array.from({ length: 12 }, () => ({ role: "assistant" as const, content: "Discussion" })), { role: "user" as const, content: "ok that date" }];
    expect(recentBaniTurns(turns)[0].content).toContain("12 October");
    expect(recentBaniTurns(turns).at(-1)?.content).toBe("ok that date");
  });
  it("bounds recent context without inventing summaries", () => expect(recentBaniTurns(Array.from({ length: 40 }, () => ({ role: "user" as const, content: "x".repeat(8000) })))).toHaveLength(6));
  it("routes ambiguous finance analysis to stronger model only", () => {
    expect(baniModel([{ role: "user", content: "investigate that discrepancy" }])).toBe("google/gemini-3-flash-preview");
    expect(baniModel([{ role: "user", content: "ok" }])).toBe("google/gemini-3.1-flash-lite");
  });
});
describe("receipt outcomes never imply posting", () => {
  it("arithmetic balance does not authorise posting", () => expect(receiptReviewReasons({}, {}, true, true)[0]).toContain("balance is not proof"));
  it("missing evidence remains explicit", () => expect(receiptReviewReasons({ cash: null }, {}, false, false).join(" ")).toContain("Missing or unclear source fields"));
  it("unbalanced figures and signs are flagged", () => {
    const row = Object.fromEntries(["subtotal","serviceCharge","discount","totalSales","visa","mastercard","amex","unionPay","jcb","alipay","wechat","payme","cash","deliveroo","foodpanda","keeta","cardTips"].map(k => [k, 0]));
    const reasons = receiptReviewReasons(row, { ...row, totalSales: 100, discount: 5 }, true, true);
    expect(reasons).toContain("Sales arithmetic does not balance"); expect(reasons).toContain("Tender components do not match total sales"); expect(reasons).toContain("Discount or tip deduction sign needs review");
  });
  it("repeated source does not imply additional revenue", () => expect(salesOutcomeMessage({ status: "flagged", intakeId: "i", repeated: true })).toContain("nothing added again"));
  it("intake failure cannot claim saved", () => expect(salesOutcomeMessage({ status: "failed", error: "Upload failed" })).toBe("Upload failed"));
  it("committed sale with journal failure warns against resubmission", () => expect(salesOutcomeMessage({ status: "saved", recordId: "r", journal: "failed" })).toContain("Do not submit"));
});