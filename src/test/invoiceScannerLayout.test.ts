import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../components/invoices/InvoiceScanner.tsx"), "utf8");

function classesFor(testid: string): string {
  const re = new RegExp(`data-testid="${testid}"[^>]*className=(?:"([^"]*)"|\\{cn\\(([^)]*)\\))`);
  const m = src.match(re);
  expect(m, `element ${testid} not found`).toBeTruthy();
  return (m![1] || m![2] || "");
}

describe("InvoiceScanner layout ownership", () => {
  it("outer shell is a bounded viewport with overflow hidden", () => {
    const c = classesFor("scanner-shell");
    expect(c).toContain("overflow-hidden");
    expect(c).toContain("flex-col");
    expect(c).toMatch(/max-h-\[/);
  });

  it("right pane is a bounded flex column with min-h-0", () => {
    const c = classesFor("review-right-pane");
    expect(c).toContain("flex");
    expect(c).toContain("flex-col");
    expect(c).toContain("min-h-0");
    expect(c).toContain("overflow-hidden");
  });

  it("header/review fields scroll independently", () => {
    const c = classesFor("review-fields-scroll");
    expect(c).toContain("overflow-y-auto");
    expect(c).toContain("min-h-0");
  });

  it("line items own a single scroll container for both axes", () => {
    const c = classesFor("line-items-scroll");
    expect(c).toContain("overflow-auto");
    expect(c).toContain("flex-1");
    expect(c).toContain("min-h-0");
    // one container => one horizontal scroll position
    expect(c).not.toContain("overflow-x-scroll");
  });

  it("table header is sticky inside the line-item viewport", () => {
    expect(src).toMatch(/<thead className="sticky top-0[^"]*"/);
  });

  it("footer with totals and actions sits outside the line-item scroll", () => {
    const c = classesFor("scanner-footer");
    expect(c).toContain("shrink-0");
    expect(c).toContain("border-t");
    expect(c).toMatch(/bg-card/);
    const footerIdx = src.indexOf('data-testid="scanner-footer"');
    const scrollIdx = src.indexOf('data-testid="line-items-scroll"');
    expect(scrollIdx).toBeGreaterThan(-1);
    expect(footerIdx).toBeGreaterThan(scrollIdx);
    // action buttons live in the footer region
    const footerBlock = src.slice(footerIdx);
    expect(footerBlock.indexOf("Approve & Save")).toBeGreaterThan(-1);
    expect(footerBlock.indexOf("Scan Another")).toBeGreaterThan(-1);
    expect(footerBlock.indexOf("Save Draft")).toBeGreaterThan(-1);
  });
});
