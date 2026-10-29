import { describe, expect, it } from "vitest";
import {
  resolveDeliveryCheckMode,
  deliveryProblemUpdates,
  deliveryHeldDelta,
} from "@/utils/deliveryCheck";
import { purchasingSectionPages, PURCHASE_ORDERS_URL } from "@/utils/purchasingNavigation";

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
  it("always shows Purchase Orders in the section list", () => {
    expect(purchasingSectionPages.some((p) => p.url === PURCHASE_ORDERS_URL)).toBe(true);
  });
});

describe("delivery problem quantities", () => {
  const lines = [
    { invoice_line_item_id: "a", quantity_invoiced: 10, quantity_received: 10, unit_price: 50 },
    { invoice_line_item_id: "b", quantity_invoiced: 4, quantity_received: 3, unit_price: 20 },
    { invoice_line_item_id: "c", quantity_invoiced: 2, quantity_received: 2, unit_price: 15 },
  ];

  it("keeps unaffected lines at their current received quantity", () => {
    const updates = deliveryProblemUpdates(lines, {});
    expect(updates).toEqual([
      { invoice_line_item_id: "a", quantity_received: 10, issue: null },
      { invoice_line_item_id: "b", quantity_received: 3, issue: null },
      { invoice_line_item_id: "c", quantity_received: 2, issue: null },
    ]);
  });

  it("subtracts the affected quantity for every issue type", () => {
    const updates = deliveryProblemUpdates(lines, {
      a: { issue: "short", affectedQty: 3 },
      b: { issue: "damaged", affectedQty: 1 },
      c: { issue: "wrong_item", affectedQty: 2 },
    });
    expect(updates[0]).toEqual({ invoice_line_item_id: "a", quantity_received: 7, issue: "short" });
    expect(updates[1]).toEqual({ invoice_line_item_id: "b", quantity_received: 2, issue: "damaged" });
    expect(updates[2]).toEqual({ invoice_line_item_id: "c", quantity_received: 0, issue: "wrong_item" });
  });

  it("clamps affected quantities between 0 and the received quantity", () => {
    expect(deliveryProblemUpdates(lines, { a: { issue: "short", affectedQty: 99 } })[0].quantity_received).toBe(0);
    expect(deliveryProblemUpdates(lines, { a: { issue: "short", affectedQty: -3 } })[0].quantity_received).toBe(10);
  });

  it("never resets unaffected lines to the invoiced quantity (scanner shortages kept)", () => {
    const updates = deliveryProblemUpdates(lines, { a: { issue: "damaged", affectedQty: 2 } });
    expect(updates[1].quantity_received).toBe(3);
  });
});

describe("delivery held delta", () => {
  const lines = [
    { invoice_line_item_id: "a", quantity_invoiced: 10, quantity_received: 10, unit_price: 50 },
    { invoice_line_item_id: "b", quantity_invoiced: 4, quantity_received: 3, unit_price: 20 },
  ];

  it("is affected qty × unit price over flagged lines only", () => {
    expect(deliveryHeldDelta(lines, { a: { issue: "short", affectedQty: 3 } })).toBe(150);
    expect(deliveryHeldDelta(lines, { a: { issue: "damaged", affectedQty: 3 }, b: { issue: "wrong_item", affectedQty: 1 } })).toBe(170);
  });

  it("is zero when nothing is flagged", () => {
    expect(deliveryHeldDelta(lines, {})).toBe(0);
  });
});
