import { describe, expect, it } from "vitest";
import { feeRows, feeWrites, readPct, type FeeRate } from "@/utils/feeTable";

const r = (id: string, payment_method: string, locality: string, rate: number, merchant_number: string | null = null, effective_from = "2000-01-01"): FeeRate =>
  ({ id, processor_id: "p", payment_method, locality, merchant_number, wallet_type: null, rate, effective_from });
const names = (n: string) => (n === "M1" ? "Assembly" : null);

describe("feeRows", () => {
  const rows = feeRows([
    r("1", "visa", "domestic", 0.015), r("2", "visa_foreign", "foreign", 0.03),
    r("3", "mastercard", "domestic", 0.026, "M1"), r("4", "mastercard", "domestic", 0.015),
    r("5", "alipay", "any", 0.012), r("6", "visa", "domestic", 0.02, null, "2999-01-01"),
  ], names, "2026-11-27");
  it("puts Hong Kong and foreign rates on one card row, merchant rates on their own row", () => {
    expect(rows.map((x) => `${x.label}${x.merchantLabel ? ` · ${x.merchantLabel}` : ""}`)).toEqual(["Visa", "Mastercard", "Mastercard · Assembly", "Alipay"]);
    expect(rows[0].hk?.rate).toBe(0.015); expect(rows[0].foreign?.rate).toBe(0.03);
    expect(rows[3].wallet).toBe(true);
  });
  it("ignores rates that start later", () => { expect(rows[0].hk?.id).toBe("1"); });
});

describe("readPct", () => {
  it("reads percentages", () => { expect(readPct("1.5")).toBe(0.015); expect(readPct("2.60%")).toBe(0.026); expect(readPct(" ")).toBeNull(); expect(readPct("abc")).toBeNaN(); expect(readPct("150")).toBeNaN(); });
});

describe("feeWrites", () => {
  const rows = feeRows([r("1", "visa", "domestic", 0.015), r("2", "visa_foreign", "foreign", 0.03), r("5", "alipay", "any", 0.012)], names, "2026-11-27");
  it("changes, removes and adds only what differs", () => {
    const { writes, bad } = feeWrites("p", rows, { "visa|": { hk: "1.6", foreign: "" }, "alipay|": { hk: "1.20", foreign: "" } });
    expect(bad).toEqual([]);
    expect(writes).toEqual([{ op: "update", id: "1", rate: 0.016 }, { op: "delete", id: "2" }]);
  });
  it("adds a missing foreign rate and flags bad numbers", () => {
    const one = feeRows([r("1", "visa", "domestic", 0.015)], names, "2026-11-27");
    expect(feeWrites("p", one, { "visa|": { hk: "1.5", foreign: "3" } }).writes).toEqual([{ op: "insert", row: { processor_id: "p", payment_method: "visa_foreign", locality: "foreign", merchant_number: null, rate: 0.03 } }]);
    expect(feeWrites("p", one, { "visa|": { hk: "x", foreign: "" } }).bad).toEqual(["Visa"]);
  });
});
