import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Contract tests for rules that live in the extraction prompt or in the save path.
 * They guard against silent regressions of the Jebsen reliability fix.
 */
describe("parse-invoice extraction contract", () => {
  const src = read("supabase/functions/parse-invoice/index.ts");

  it("states the strict monetary-row segmentation rule", () => {
    expect(src).toContain("ROW SEGMENTATION");
    expect(src).toMatch(/Every visually distinct monetary row is its OWN line_item/);
    expect(src).toMatch(/NEVER means two rows should be merged/);
    expect(src).toMatch(/Deposit, container, packaging/);
    expect(src).toMatch(/NEVER concatenate the descriptions/);
  });

  it("asks for source_line_no and printed_amount", () => {
    expect(src).toContain("source_line_no");
    expect(src).toContain("printed_amount");
  });

  it("prefers Document No over Sales Order No for the invoice number", () => {
    expect(src).toMatch(/INVOICE \/ DOCUMENT IDENTIFIER PRECEDENCE/);
    expect(src).toMatch(/"Document No"/);
    expect(src).toMatch(/"Sales Order No"[^\n]*MUST NEVER be used as invoice_number|REFERENCES ONLY/);
    expect(src).toMatch(/D365 No/);
  });

  it("lets an explicit printed venue name win over an address heuristic", () => {
    expect(src).toMatch(/VENUE PRECEDENCE/);
    expect(src).toMatch(/T\/A ASSEMBLY/);
    expect(src).toMatch(/Never let an address heuristic override an explicitly printed venue name/);
    expect(src).toMatch(/Knutsford Terrace/);
  });

  it("no longer feeds the Product Master into the extraction pass", () => {
    expect(src).not.toContain("PRODUCT MASTER MATCHING — CRITICAL INSTRUCTIONS");
    expect(src).not.toContain("productMasterContext");
    expect(src).not.toMatch(/matched_sku: \{ type: "string" \},\s*\n\s*\},\s*\n\s*\},\s*\n\s*\},\s*\n\s*\},\s*\n\s*\},\s*\n\s*\},\s*\n\s*\},\s*\n\s*\};/);
  });

  it("keeps the returned-keg special handling", () => {
    expect(src).toMatch(/RETURNED\/EMPTY KEGS/);
    expect(src).toContain("ABADE2");
  });

  it("lets Agent 2 repair row structure without a third vision call", () => {
    expect(src).toContain("line_replacements");
    expect(src).toContain("shouldApplyLineReplacement");
    expect(src).toContain("validateInvoiceStructure");
    // exactly two gateway calls: extraction + review
    const calls = src.match(/ai\.gateway\.lovable\.dev\/v1\/chat\/completions/g) || [];
    expect(calls.length).toBe(2);
  });
});

describe("scanner save path", () => {
  const src = read("src/hooks/useInvoiceData.ts");

  it("does not rematch scanner lines globally before the RPC", () => {
    const fnStart = src.indexOf("const createScannerInvoiceWithAttachments");
    const fnEnd = src.indexOf("const updateInvoice");
    const body = src.slice(fnStart, fnEnd);
    expect(body).not.toContain("matchLineItemsToProductMaster");
    expect(body).toContain("create_scanner_invoice_with_attachments");
  });

  it("keeps manual invoice creation matching untouched", () => {
    expect(src).toContain("const matchedItems = await matchLineItemsToProductMaster(");
  });
});

describe("scanner persists scanned source evidence", () => {
  const src = read("src/components/invoices/InvoiceScanner.tsx");

  it("sends the four source fields in the save payload", () => {
    expect(src).toContain("scanned_item_code: l.scanned_item_code ?? l.item_code");
    expect(src).toContain("scanned_description: l.scanned_description ?? l.description");
    expect(src).toMatch(/printed_amount: l\.printed_amount/);
    expect(src).toContain("source_line_no: l.source_line_no ?? \"\"");
  });

  it("uses the shared total-mismatch gate for saving", () => {
    expect(src).toContain("invoiceTotalMismatch(inv as any, { mode: modeForInvoice(inv) })");
  });

  it("shows the total mismatch in the on-screen blocking lists", () => {
    expect(src).toContain("header-total-mismatch");
    expect(src).toContain("totalMismatchBlocking");
  });
});
