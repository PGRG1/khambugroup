import { describe, it, expect } from "vitest";
import {
  validateInvoiceStructure,
  shouldApplyLineReplacement,
  sumPrintedAmounts,
  monetaryLines,
} from "../../supabase/functions/_shared/invoiceRowStructure";
import { buildMatchLinkPatch, buildRemoveMatchPatch } from "@/utils/invoiceMatchActions";
import { resolveExactMatch } from "@/utils/productMasterResolver";
import { invoiceTotalMismatch, calculatedInvoiceTotal, sumPrintedLineAmounts } from "@/utils/invoiceTotalReconciliation";
import { resolveGrnUnitCost, resolveGrnAcceptedPrice, isFreeGoodsLine } from "@/utils/grnLineCost";
import { shouldRecompress, targetDimensions } from "@/utils/imageCompression";

/**
 * Synthetic Jebsen Beverage delivery note: 4 printed Line No groups, each printing
 * a product row and a deposit row. Blank/repeated line numbers must never merge rows.
 */
const JEBSEN_LINES = [
  { source_line_no: "1", item_code: "B095|HOE501", description: "HOEGAARDEN - 20L KEG", quantity: 2, unit: "KEG", unit_price: 1075.5, total: 2151.0, printed_amount: 2151.0 },
  { source_line_no: "1", item_code: "B095|HOE501-D", description: "DEPOSIT - HOEGAARDEN - 20L KEG", quantity: 2, unit: "EA", unit_price: 50, total: 100.0, printed_amount: 100.0 },
  { source_line_no: "", item_code: "B095|HOE501", description: "HOEGAARDEN - 20L KEG", quantity: 1, unit: "KEG", unit_price: 0, total: 0, printed_amount: 0 },
  { source_line_no: "", item_code: "B095|HOE501-D", description: "DEPOSIT - HOEGAARDEN - 20L KEG", quantity: 1, unit: "EA", unit_price: 50, total: 50.0, printed_amount: 50.0 },
  { source_line_no: "2", item_code: "B095|STE602", description: "STELLA ARTOIS - 30L KEG (B)", quantity: 4, unit: "KEG", unit_price: 1320.3, total: 5281.2, printed_amount: 5281.2 },
  { source_line_no: "2", item_code: "B095|STE602-D", description: "DEPOSIT - STELLA ARTOIS - 30L KEG(B)", quantity: 4, unit: "EA", unit_price: 50, total: 200.0, printed_amount: 200.0 },
  { source_line_no: "2", item_code: "B095|STE602", description: "STELLA ARTOIS - 30L KEG (B)", quantity: 2, unit: "KEG", unit_price: 0, total: 0, printed_amount: 0 },
  { source_line_no: "2", item_code: "B095|STE602-D", description: "DEPOSIT - STELLA ARTOIS - 30L KEG(B)", quantity: 2, unit: "EA", unit_price: 50, total: 100.0, printed_amount: 100.0 },
];
const JEBSEN_TOTAL = 7882.2;

describe("Jebsen row structure", () => {
  it("keeps 8 monetary rows from 4 printed line-number groups, including 4 deposit rows", () => {
    expect(JEBSEN_LINES).toHaveLength(8);
    const groups = new Set(JEBSEN_LINES.map((l) => l.source_line_no));
    expect(groups.size).toBeLessThan(JEBSEN_LINES.length); // repeated/blank line numbers
    const deposits = JEBSEN_LINES.filter((l) => l.item_code.endsWith("-D"));
    expect(deposits).toHaveLength(4);
  });

  it("blank or repeated source_line_no never implies merging", () => {
    const blank = JEBSEN_LINES.filter((l) => l.source_line_no === "");
    expect(blank).toHaveLength(2);
    const repeated = JEBSEN_LINES.filter((l) => l.source_line_no === "2");
    expect(repeated).toHaveLength(4);
    // each row keeps its own description — never concatenated
    expect(repeated.map((l) => l.description)).toEqual([
      "STELLA ARTOIS - 30L KEG (B)",
      "DEPOSIT - STELLA ARTOIS - 30L KEG(B)",
      "STELLA ARTOIS - 30L KEG (B)",
      "DEPOSIT - STELLA ARTOIS - 30L KEG(B)",
    ]);
  });

  it("keeps zero-price free rows as real monetary rows", () => {
    const free = JEBSEN_LINES.filter((l) => l.unit_price === 0);
    expect(free).toHaveLength(2);
    expect(monetaryLines(JEBSEN_LINES)).toHaveLength(8);
  });

  it("printed amounts sum to the header total and reconcile", () => {
    expect(sumPrintedAmounts(JEBSEN_LINES)).toBe(JEBSEN_TOTAL);
    const v = validateInvoiceStructure(JEBSEN_LINES, JEBSEN_TOTAL);
    expect(v.reconciles).toBe(true);
    expect(v.blocking).toBe(false);
    expect(v.lineCount).toBe(8);
  });

  it("flags merged rows as a blocking structure problem", () => {
    const merged = [
      { description: "HOEGAARDEN - 20L KEG DEPOSIT - HOEGAARDEN - 20L KEG", quantity: 2, unit_price: 1075.5, total: 2151.0, printed_amount: 2151.0 },
      ...JEBSEN_LINES.slice(4),
    ];
    const v = validateInvoiceStructure(merged, JEBSEN_TOTAL);
    expect(v.blocking).toBe(true);
    expect(v.message).toMatch(/Row structure/);
  });

  it("excludes synthetic returned-keg rows from reconciliation", () => {
    const withRefund = [
      ...JEBSEN_LINES,
      { description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L", quantity: -1, unit_price: 50, total: -50, printed_amount: -50, counts_toward_total: false },
    ];
    expect(validateInvoiceStructure(withRefund, JEBSEN_TOTAL).reconciles).toBe(true);
  });
});

describe("Agent 2 line replacement gate", () => {
  const merged = [
    { description: "HOEGAARDEN 20L KEG + DEPOSIT", quantity: 2, unit_price: 1075.5, total: 2251.0, printed_amount: 2251.0 },
    ...JEBSEN_LINES.slice(4),
  ];

  it("applies a high-confidence replacement that reconciles", () => {
    const d = shouldApplyLineReplacement({
      confidence: 0.92,
      headerTotal: JEBSEN_TOTAL,
      currentLines: merged,
      replacementLines: JEBSEN_LINES,
    });
    expect(d.apply).toBe(true);
  });

  it("rejects a low-confidence replacement", () => {
    const d = shouldApplyLineReplacement({
      confidence: 0.6,
      headerTotal: JEBSEN_TOTAL,
      currentLines: merged,
      replacementLines: JEBSEN_LINES,
    });
    expect(d.apply).toBe(false);
  });

  it("never replaces a good structure with a worse one", () => {
    const d = shouldApplyLineReplacement({
      confidence: 0.99,
      headerTotal: JEBSEN_TOTAL,
      currentLines: JEBSEN_LINES,
      replacementLines: merged,
    });
    expect(d.apply).toBe(false);
  });
});

describe("supplier-scoped exact SKU matching for deposit products", () => {
  const pm = [
    { id: "p1", internal_sku: "HOE-KEG-20", external_sku: "B095|HOE501", supplier: "Jebsen Beverage", supplier_product_name: "HOEGAARDEN - 20L KEG", internal_product_name: "Hoegaarden Keg 20L" },
    { id: "p2", internal_sku: "HOE-DEP-20", external_sku: "B095|HOE501-D", supplier: "Jebsen Beverage", supplier_product_name: "DEPOSIT - HOEGAARDEN - 20L KEG", internal_product_name: "Hoegaarden Keg Deposit" },
    { id: "p3", internal_sku: "STE-KEG-30", external_sku: "B095|STE602", supplier: "Jebsen Beverage", supplier_product_name: "STELLA ARTOIS - 30L KEG (B)", internal_product_name: "Stella Artois Keg 30L" },
    { id: "p4", internal_sku: "STE-DEP-30", external_sku: "B095|STE602-D", supplier: "Jebsen Beverage", supplier_product_name: "DEPOSIT - STELLA ARTOIS - 30L KEG(B)", internal_product_name: "Stella Artois Keg Deposit" },
  ] as any[];

  it("resolves the exact deposit SKUs to the deposit products", () => {
    const a = resolveExactMatch({ itemCode: "B095|HOE501-D", description: "DEPOSIT - HOEGAARDEN - 20L KEG" }, pm, "Jebsen Beverage");
    expect(a?.id).toBe("p2");
    const b = resolveExactMatch({ itemCode: "B095|STE602-D", description: "DEPOSIT - STELLA ARTOIS - 30L KEG(B)" }, pm, "Jebsen Beverage");
    expect(b?.id).toBe("p4");
  });

  it("does not resolve across suppliers", () => {
    const m = resolveExactMatch({ itemCode: "B095|HOE501-D", description: "DEPOSIT - HOEGAARDEN - 20L KEG" }, pm, "Some Other Supplier");
    expect(m).toBeNull();
  });
});

describe("matching preserves scanned source truth", () => {
  const line = {
    item_code: "B095|HOE501-D",
    description: "DEPOSIT - HOEGAARDEN - 20L KEG",
    matched_sku: "",
    matched_internal_name: "",
    matched_stock_uom: "",
    matched_purchase_uom: "",
  };
  const entry = {
    id: "p2",
    internal_sku: "HOE-DEP-20",
    internal_product_name: "Hoegaarden Keg Deposit",
    supplier_product_name: "KEG DEPOSIT (MASTER WORDING)",
    external_sku: "MASTER-SKU-999",
  };

  it("keeps external name and SKU exactly as printed when a match is applied", () => {
    const patch = buildMatchLinkPatch(line as any, entry as any);
    expect(patch.description).toBe("DEPOSIT - HOEGAARDEN - 20L KEG");
    expect(patch.item_code).toBe("B095|HOE501-D");
    expect(patch.scanned_description).toBe("DEPOSIT - HOEGAARDEN - 20L KEG");
    expect(patch.scanned_item_code).toBe("B095|HOE501-D");
    expect(patch.matched_sku).toBe("HOE-DEP-20");
    expect(patch.product_master_id).toBe("p2");
  });

  it("removing a match never changes source fields", () => {
    const linked = { ...line, ...buildMatchLinkPatch(line as any, entry as any) };
    const removed = buildRemoveMatchPatch(linked as any);
    expect(removed.description).toBe("DEPOSIT - HOEGAARDEN - 20L KEG");
    expect(removed.item_code).toBe("B095|HOE501-D");
    expect(removed.product_master_id).toBeNull();
  });
});

describe("printed vs calculated total blocks save", () => {
  const scannerLines = JEBSEN_LINES.map((l) => ({
    quantity: String(l.quantity),
    unit_price: String(l.unit_price),
    discount: "0",
    tax_amount: "0",
    total: String(l.total),
    printed_amount: String(l.printed_amount),
  }));

  it("reconciled invoice does not block", () => {
    expect(calculatedInvoiceTotal(scannerLines, 0)).toBe(JEBSEN_TOTAL);
    expect(sumPrintedLineAmounts(scannerLines)).toBe(JEBSEN_TOTAL);
    expect(invoiceTotalMismatch({ ai_total: JEBSEN_TOTAL, invoice_discount: "0", line_items: scannerLines })).toBe(false);
  });

  it("a mismatch greater than HK$0.50 blocks", () => {
    expect(invoiceTotalMismatch({ ai_total: JEBSEN_TOTAL + 100, invoice_discount: "0", line_items: scannerLines })).toBe(true);
  });

  it("rounding-level differences do not block", () => {
    expect(invoiceTotalMismatch({ ai_total: JEBSEN_TOTAL + 0.4, invoice_discount: "0", line_items: scannerLines })).toBe(false);
  });

  it("no printed total means nothing to reconcile", () => {
    expect(invoiceTotalMismatch({ ai_total: null, invoice_discount: "0", line_items: scannerLines })).toBe(false);
  });
});

describe("free goods stay zero cost downstream", () => {
  const freeLine = { quantity: 1, unit_price: 0, is_free_unit_line: true, net_unit_cost: 0, normalized_unit_cost: 950, accepted_price: 1075.5, total: 0 };

  it("is recognised as free goods", () => {
    expect(isFreeGoodsLine(freeLine)).toBe(true);
    expect(isFreeGoodsLine({ quantity: 2, unit_price: 1075.5 })).toBe(false);
  });

  it("GRN unit cost and accepted price stay 0", () => {
    const cost = resolveGrnUnitCost(freeLine);
    expect(cost).toBe(0);
    expect(resolveGrnAcceptedPrice(freeLine, cost)).toBe(0);
  });

  it("priced lines keep their cost", () => {
    const priced = { quantity: 2, unit_price: 1075.5, net_unit_cost: 1075.5, accepted_price: 1075.5 };
    const cost = resolveGrnUnitCost(priced);
    expect(cost).toBe(1075.5);
    expect(resolveGrnAcceptedPrice(priced, cost)).toBe(1075.5);
  });
});

describe("image preparation preserves source fidelity", () => {
  it("keeps an already reasonable photo untouched", () => {
    expect(shouldRecompress({ type: "image/jpeg", size: 2 * 1024 * 1024, width: 3000, height: 2000 })).toBe(false);
  });

  it("recompresses oversized photos", () => {
    expect(shouldRecompress({ type: "image/jpeg", size: 9 * 1024 * 1024, width: 3000, height: 2000 })).toBe(true);
    expect(shouldRecompress({ type: "image/jpeg", size: 1024, width: 6000, height: 4000 })).toBe(true);
  });

  it("never touches PDFs", () => {
    expect(shouldRecompress({ type: "application/pdf", size: 99 * 1024 * 1024, width: 0, height: 0 })).toBe(false);
  });

  it("caps the longest edge at 3200 preserving aspect ratio", () => {
    expect(targetDimensions(6000, 4000)).toEqual({ width: 3200, height: 2133 });
    expect(targetDimensions(2000, 1500)).toEqual({ width: 2000, height: 1500 });
  });
});
