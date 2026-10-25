// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPaymentTotal, getDeliveryTotal } from "@/utils/salesUtils";

const base = { visa: 1000, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 500, cardTips: 0 };

describe("delivery platforms in payment total", () => {
  it("counts Deliveroo, Foodpanda and Keeta toward the payment total", () => {
    expect(getPaymentTotal({ ...base, deliveroo: 300, foodpanda: 200, keeta: 100 })).toBe(2100);
  });
  it("treats missing delivery values as zero", () => {
    expect(getPaymentTotal(base)).toBe(1500);
    expect(getDeliveryTotal({})).toBe(0);
  });
});
