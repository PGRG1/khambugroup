import { describe, expect, it } from "vitest";
import { canApplyProposal, correctDraftLine, sameSupplier, validCorrection, validateProposal, type DraftProposal } from "@/utils/floatingDraft";
import { buildMatchLinkPatch } from "@/utils/invoiceMatchActions";
import { computeAcceptedAmount } from "@/utils/invoiceAcceptedAmount";
const proposal: DraftProposal = { id: "p1", binding: "user:tenant:draft:1", lineId: "line1", field: "quantity", value: "3", reason: "User confirmed three units." };
const line = { quantity: "2", unit_price: "10", tax_amount: "2", discount: "1", total: "21", accepted_qty: "2", printed_amount: "31", scanned_description: "Printed item", scanned_item_code: "SOURCE", pack_size: "24", matched_stock_qty_ratio: 24 };
describe("Floating invoice review safety", () => {
  it("allows only the explicit editable whitelist, never postings or master conversions", () => {
    expect(validCorrection("quantity", "3", line)).toBe(true);
    for (const field of ["sql", "delete", "approved", "stock_qty", "purchase_unit_cost", "total"]) expect(validCorrection(field, "3", line)).toBe(false);
  });
  it("rejects invalid values and new negative lines while preserving signed refunds", () => {
    for (const value of ["NaN", "Infinity", "3oops", "-2"]) expect(validCorrection("quantity", value, line)).toBe(false);
    expect(validCorrection("quantity", "-2", { quantity: "-1" })).toBe(true);
    expect(validCorrection("unit_price", "-2", { quantity: "-1" })).toBe(false);
    expect(validCorrection("accepted_price", "3", { is_free_unit_line: true })).toBe(false);
  });
  it("rejects a supplier entry absent from the server-verified candidate list", () => {
    const match = { ...proposal, field: "match", value: "12345678-1234-1234-1234-123456789abc" };
    expect(validateProposal(match, proposal.binding, "line1", line, [])).toBeNull();
    expect(validateProposal(match, proposal.binding, "line1", line, [match.value])).toEqual(match);
    expect(sameSupplier("Supplier A", "Supplier B")).toBe(false);
  });
  it("rejects wrong tenant, line, revision, view-only and repeated apply", () => {
    expect(canApplyProposal(proposal, proposal.binding, "line1", true, new Set())).toBe(true);
    for (const binding of ["user:otherTenant:draft:1", "user:tenant:draft:2"]) expect(canApplyProposal(proposal, binding, "line1", true, new Set())).toBe(false);
    expect(canApplyProposal(proposal, proposal.binding, "line2", true, new Set())).toBe(false);
    expect(canApplyProposal(proposal, proposal.binding, "line1", false, new Set())).toBe(false);
    expect(canApplyProposal(proposal, proposal.binding, "line1", true, new Set(["p1"]))).toBe(false);
  });
  it("recalculates quantity × price minus discount plus tax with accepted quantity synchronized", () => {
    const next = correctDraftLine(line, proposal, "sum_then_round");
    expect(next.total).toBe("31.00"); expect(next.accepted_qty).toBe("3");
    expect(next.scanned_description).toBe("Printed item"); expect(next.matched_stock_qty_ratio).toBe(24);
    expect(computeAcceptedAmount({ quantity: next.quantity, unitPrice: next.unit_price, invoicedTotal: next.total, acceptedQty: next.accepted_qty })).toBe(31);
  });
  it("source pack correction never changes Items Master conversion or quantity", () => {
    const next = correctDraftLine(line, { ...proposal, field: "pack_size", value: "12" }, "sum_then_round");
    expect(next.pack_size).toBe("12"); expect(next.matched_stock_qty_ratio).toBe(24); expect(next.quantity).toBe("2");
  });
  it("matching uses supplier canonical fields while retaining scanned evidence", () => {
    const patch = buildMatchLinkPatch({ ...line, item_code: "SOURCE", description: "Printed item", matched_sku: "", matched_internal_name: "", matched_stock_uom: "", matched_purchase_uom: "" }, { id: "product", supplier_entry_id: "supplierEntry", internal_sku: "SKU", internal_product_name: "Master", supplier_product_name: "Supplier item", external_sku: "EXT", stock_qty: 24 });
    expect(patch.description).toBe("Supplier item"); expect(patch.item_code).toBe("EXT"); expect(patch.scanned_description).toBe("Printed item"); expect(patch.scanned_item_code).toBe("SOURCE"); expect(patch.matched_stock_qty_ratio).toBe(24);
  });
});