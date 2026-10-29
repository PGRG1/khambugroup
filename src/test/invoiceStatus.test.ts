import { describe, expect, it } from "vitest";
import {
  REVIEW_STATUSES,
  mapScannerReviewStatus,
  computeHeldAmount,
  outstandingAfterHold,
  purchasingRoleForMember,
} from "@/utils/invoiceStatus";

describe("invoice review statuses", () => {
  it("allows Draft, To approve, Approved, Disputed, Voided", () => {
    expect(REVIEW_STATUSES).toEqual(["Draft", "To approve", "Approved", "Disputed", "Voided"]);
  });

  it("maps the scanner save statuses onto review_status", () => {
    expect(mapScannerReviewStatus("under_review")).toBe("Draft");
    expect(mapScannerReviewStatus("disputed")).toBe("Disputed");
    expect(mapScannerReviewStatus("approved")).toBe("Approved");
    expect(mapScannerReviewStatus("paid")).toBe("Approved");
    expect(mapScannerReviewStatus(undefined)).toBe("Approved");
  });
});

describe("held amount", () => {
  it("is the sum of max(0, invoiced − accepted) per line", () => {
    expect(computeHeldAmount([
      { quantity: 6, unit_price: 150, total: 900, accepted_qty: 5, accepted_price: null },
      { quantity: 6, unit_price: 50, total: 300, accepted_qty: 6, accepted_price: null },
    ])).toBe(150);
  });

  it("uses accepted_price when present and never goes negative", () => {
    expect(computeHeldAmount([
      { quantity: 2, unit_price: 35, total: 70, accepted_qty: 2, accepted_price: 40 },
    ])).toBe(0);
  });

  it("falls back to qty × price when total is missing", () => {
    expect(computeHeldAmount([
      { quantity: 10, unit_price: 70, accepted_qty: 4 },
    ])).toBe(420);
  });

  it("is zero for fully accepted invoices", () => {
    expect(computeHeldAmount([{ quantity: 3, unit_price: 14.7, total: 44.1, accepted_qty: 3, accepted_price: 14.7 }])).toBe(0);
  });
});

describe("outstanding after hold", () => {
  it("subtracts held amounts from what's payable", () => {
    expect(outstandingAfterHold(1968, 0, 150)).toBe(1818);
    expect(outstandingAfterHold(700, 0, 420)).toBe(280);
  });

  it("never goes below zero", () => {
    expect(outstandingAfterHold(100, 80, 50)).toBe(0);
  });
});

describe("purchasing role backfill mapping", () => {
  it("maps tenant_admin to owner", () => {
    expect(purchasingRoleForMember("tenant_admin", [])).toBe("owner");
  });

  it("maps members with a global manager role to manager", () => {
    expect(purchasingRoleForMember("member", ["manager"])).toBe("manager");
  });

  it("maps other members to staff", () => {
    expect(purchasingRoleForMember("member", [])).toBe("staff");
    expect(purchasingRoleForMember("member", ["admin"])).toBe("staff");
  });

  it("leaves platform_admin null", () => {
    expect(purchasingRoleForMember("platform_admin", ["admin"])).toBeNull();
  });
});
