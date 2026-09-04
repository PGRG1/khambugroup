import { describe, it, expect } from "vitest";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_METHOD_TBC,
  UNASSIGNED_ACCOUNT,
  isBankLinkedMethod,
  paidFromAccountLabel,
  paymentMethodLabel,
  referencePlaceholder,
  resolvePaidFromAccountId,
} from "@/utils/paymentMethods";

const BANK_ID = "11111111-1111-1111-1111-111111111111";

describe("payment method options", () => {
  it("offers a TBC / Unassigned option with a stable stored value", () => {
    const tbc = PAYMENT_METHOD_OPTIONS.find((o) => o.value === PAYMENT_METHOD_TBC);
    expect(tbc).toBeTruthy();
    expect(tbc!.label).toBe("TBC / Unassigned");
    expect(tbc!.bankLinked).toBe(false);
  });

  it("marks only bank-settled methods as bank linked", () => {
    expect(isBankLinkedMethod("Bank Transfer")).toBe(true);
    expect(isBankLinkedMethod("FPS")).toBe(true);
    expect(isBankLinkedMethod("Cheque")).toBe(true);
    expect(isBankLinkedMethod("Cash")).toBe(false);
    expect(isBankLinkedMethod("Credit Card")).toBe(false);
    expect(isBankLinkedMethod("Other")).toBe(false);
    expect(isBankLinkedMethod(PAYMENT_METHOD_TBC)).toBe(false);
    expect(isBankLinkedMethod(null)).toBe(false);
  });
});

describe("resolvePaidFromAccountId", () => {
  it("saves TBC with a null paid_from_account_id even if an account was picked", () => {
    expect(resolvePaidFromAccountId(PAYMENT_METHOD_TBC, BANK_ID)).toBeNull();
  });

  it("clears the bank account for Cash and Other", () => {
    expect(resolvePaidFromAccountId("Cash", BANK_ID)).toBeNull();
    expect(resolvePaidFromAccountId("Other", BANK_ID)).toBeNull();
  });

  it("keeps a stale account from being retained after switching methods", () => {
    let method = "Bank Transfer";
    let account: string | null = BANK_ID;
    expect(resolvePaidFromAccountId(method, account)).toBe(BANK_ID);
    method = PAYMENT_METHOD_TBC;
    account = resolvePaidFromAccountId(method, account); // UI clears on change
    expect(account).toBeNull();
    method = "Bank Transfer";
    expect(resolvePaidFromAccountId(method, account)).toBeNull();
  });

  it("allows a bank-linked method to be saved unassigned", () => {
    expect(resolvePaidFromAccountId("FPS", UNASSIGNED_ACCOUNT)).toBeNull();
    expect(resolvePaidFromAccountId("FPS", "")).toBeNull();
    expect(resolvePaidFromAccountId("FPS", BANK_ID)).toBe(BANK_ID);
  });

  it("does not auto-select a first bank account (empty default stays unassigned)", () => {
    const initialSelection = ""; // dialog default — never bankAccounts[0].id
    expect(resolvePaidFromAccountId("Bank Transfer", initialSelection)).toBeNull();
  });
});

describe("display labels", () => {
  it("shows TBC / Unassigned for tbc and blank methods", () => {
    expect(paymentMethodLabel(PAYMENT_METHOD_TBC)).toBe("TBC / Unassigned");
    expect(paymentMethodLabel("")).toBe("TBC / Unassigned");
    expect(paymentMethodLabel(null)).toBe("TBC / Unassigned");
    expect(paymentMethodLabel("Cash")).toBe("Cash");
    expect(paymentMethodLabel("Legacy Method")).toBe("Legacy Method");
  });

  it("never shows bank digits when the account is null", () => {
    expect(paidFromAccountLabel(null)).toBe("Unassigned");
    expect(paidFromAccountLabel("")).toBe("Unassigned");
    expect(paidFromAccountLabel("HSBC •••1234")).toBe("HSBC •••1234");
  });

  it("keeps the reference placeholder neutral for TBC and Other", () => {
    expect(referencePlaceholder(PAYMENT_METHOD_TBC)).toBe("Optional");
    expect(referencePlaceholder("Other")).toBe("Optional");
    expect(referencePlaceholder("FPS")).toContain("FPS");
  });
});
