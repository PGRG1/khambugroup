import { describe, expect, it } from "vitest";
import {
  resolveDeliveryCheckMode,
  showPurchaseOrdersInNav,
  shouldOfferDoorTap,
  planDeliveryGrn,
  deliveryGrnItemUpdates,
} from "@/utils/deliveryCheck";
import { purchasingSectionPages, purchasingSectionPagesForDelivery, PURCHASE_ORDERS_URL } from "@/utils/purchasingNavigation";

describe("delivery check mode", () => {
  it("defaults to quick when the setting is missing", () => {
    expect(resolveDeliveryCheckMode(null)).toBe("quick");
    expect(resolveDeliveryCheckMode(undefined)).toBe("quick");
    expect(resolveDeliveryCheckMode("")).toBe("quick");
  });

  it("accepts full and rejects unknown values", () => {
    expect(resolveDeliveryCheckMode("full")).toBe("full");
    expect(resolveDeliveryCheckMode("quick")).toBe("quick");
    expect(resolveDeliveryCheckMode("something-else")).toBe("quick");
  });
});

describe("purchase orders nav rule", () => {
  it("shows Purchase Orders in full mode", () => {
    expect(showPurchaseOrdersInNav("full", false)).toBe(true);
  });

  it("hides Purchase Orders in quick mode unless a supplier needs a PO", () => {
    expect(showPurchaseOrdersInNav("quick", false)).toBe(false);
    expect(showPurchaseOrdersInNav("quick", true)).toBe(true);
  });

  it("filters the PO page out of the section list in quick mode", () => {
    const pages = purchasingSectionPagesForDelivery(purchasingSectionPages, "quick", false);
    expect(pages.some((p) => p.url === PURCHASE_ORDERS_URL)).toBe(false);
    expect(pages.some((p) => p.url === "/procurement/receiving")).toBe(true);
    const kept = purchasingSectionPagesForDelivery(purchasingSectionPages, "quick", true);
    expect(kept.some((p) => p.url === PURCHASE_ORDERS_URL)).toBe(true);
  });
});

describe("door tap eligibility", () => {
  it("applies only in quick mode for suppliers without needs_po", () => {
    expect(shouldOfferDoorTap("quick", false)).toBe(true);
    expect(shouldOfferDoorTap("quick", true)).toBe(false);
    expect(shouldOfferDoorTap("full", false)).toBe(false);
    expect(shouldOfferDoorTap("full", true)).toBe(false);
  });
});

describe("no-duplicate GRN rule", () => {
  it("reuses an existing GRN instead of creating one", () => {
    expect(planDeliveryGrn("grn-123").create).toBe(false);
  });

  it("creates only when no GRN exists for the invoice", () => {
    expect(planDeliveryGrn(null).create).toBe(true);
  });
});

describe("delivery GRN item updates", () => {
  const lines = [
    { invoice_line_item_id: "a", quantity_invoiced: 10 },
    { invoice_line_item_id: "b", quantity_invoiced: 4 },
    { invoice_line_item_id: "c", quantity_invoiced: 2 },
  ];

  it("keeps unaffected lines at the invoiced quantity", () => {
    const updates = deliveryGrnItemUpdates(lines, {});
    expect(updates).toEqual([
      { invoice_line_item_id: "a", quantity_received: 10, issue: null },
      { invoice_line_item_id: "b", quantity_received: 4, issue: null },
      { invoice_line_item_id: "c", quantity_received: 2, issue: null },
    ]);
  });

  it("short lines use the arrived quantity", () => {
    const updates = deliveryGrnItemUpdates(lines, { a: { issue: "short", receivedQty: 7 } });
    expect(updates[0]).toEqual({ invoice_line_item_id: "a", quantity_received: 7, issue: "short" });
    expect(updates[1].issue).toBeNull();
  });

  it("clamps short quantities between 0 and the invoiced quantity", () => {
    expect(deliveryGrnItemUpdates(lines, { a: { issue: "short", receivedQty: 99 } })[0].quantity_received).toBe(10);
    expect(deliveryGrnItemUpdates(lines, { a: { issue: "short", receivedQty: -3 } })[0].quantity_received).toBe(0);
  });

  it("damaged and wrong-item lines keep the invoiced quantity", () => {
    const updates = deliveryGrnItemUpdates(lines, {
      b: { issue: "damaged" },
      c: { issue: "wrong_item" },
    });
    expect(updates[1]).toEqual({ invoice_line_item_id: "b", quantity_received: 4, issue: "damaged" });
    expect(updates[2]).toEqual({ invoice_line_item_id: "c", quantity_received: 2, issue: "wrong_item" });
  });
});
