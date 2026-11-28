import { describe, expect, it } from "vitest";
import { matchScore, nextDelivery, orderText, priceAfterDeal } from "../../supabase/functions/chat-assistant/orderLists";

describe("ordering in chat", () => {
  it("finds items through typos and plurals", () => {
    expect(matchScore("frys", ["Fries Thin Cut 7mm 2.5kg"])).toBeGreaterThanOrEqual(0.55);
    expect(matchScore("olive", ["Olives Kalamata 2kg"])).toBeGreaterThanOrEqual(0.85);
    expect(matchScore("sugr", ["Sugar White 1kg"])).toBeGreaterThanOrEqual(0.55);
    expect(matchScore("lemons", ["Olives Kalamata 2kg"])).toBeLessThan(0.55);
  });
  it("takes the next delivery day on or after today", () => {
    expect(nextDelivery(["Tue", "Fri"], "2026-11-28")).toBe("2026-12-01"); // Sat → Tue
    expect(nextDelivery(["Sat"], "2026-11-28")).toBe("2026-11-28");
    expect(nextDelivery([], "2026-11-28")).toBeNull();
  });
  it("applies a discount deal to the unit price, not a free-units deal", () => {
    expect(priceAfterDeal(37, { deal_type: "discount", discount_percent: 2 } as never)).toBe(36.26);
    expect(priceAfterDeal(37, { deal_type: "discount", special_price: 30 } as never)).toBe(30);
    expect(priceAfterDeal(37, { deal_type: "buy_x_get_y_free", buy_qty: 5, free_qty: 1 } as never)).toBe(37);
  });
  it("writes the list in the supplier's codes and names", () => {
    expect(orderText({ venue: "ARKA Central", delivery_date: "2026-12-01", lines: [{ product_master_id: "p", code: "44230.1", name: "KALAMATA OLIVES 2KG", qty: 6, unit: "Tin", unit_price: 92, total: 552 }] }))
      .toBe("Hi, order for ARKA Central, delivery Tue 1 Dec:\n44230.1 KALAMATA OLIVES 2KG × 6 Tin\nThank you!");
  });
});
