import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../components/invoices/InvoiceScanner.tsx"), "utf8");

function classesFor(testid: string): string {
  const re = new RegExp(`data-testid="${testid}"[^>]*className=(?:"([^"]*)"|\\{cn\\(([\\s\\S]*?)\\)\\})`);
  const m = src.match(re);
  expect(m, `element ${testid} not found`).toBeTruthy();
  return (m![1] || m![2] || "");
}

describe("InvoiceScanner layout ownership", () => {
  it("outer shell is bounded in review state and sizes naturally for upload", () => {
    const c = classesFor("scanner-shell");
    expect(c).toContain("overflow-hidden");
    expect(c).toContain("flex-col");
    expect(c).toContain("max-h-[calc(100dvh-4rem)]");
    // full viewport height must be gated by the review state only
    expect(c).toMatch(/isReview\s*\?\s*"h-\[calc\(100dvh-4rem\)\] max-h-\[calc\(100dvh-4rem\)\]"\s*:\s*"max-h-\[calc\(100dvh-4rem\)\]"/);
  });

  it("right pane is a bounded flex column with min-h-0", () => {
    const c = classesFor("review-right-pane");
    expect(c).toContain("flex");
    expect(c).toContain("flex-col");
    expect(c).toContain("min-h-0");
    expect(c).toContain("overflow-hidden");
  });

  it("header/review fields size to content without owning a desktop scrollbar", () => {
    const c = classesFor("review-fields-scroll");
    expect(c).toContain("shrink-0");
    expect(c).toContain("min-h-0");
    expect(c).toContain("lg:overflow-visible");
    expect(c).not.toMatch(/max-h-\[/);
    expect(c).not.toContain("overflow-y-auto");
  });

  it("line items own a single scroll container for both axes", () => {
    const c = classesFor("line-items-scroll");
    expect(c).toContain("overflow-auto");
    expect(c).toContain("flex-1");
    expect(c).toContain("min-h-0");
    expect(c).toContain("lg:min-h-[240px]");
    // one container => one horizontal scroll position
    expect(c).not.toContain("overflow-x-scroll");
  });

  it("keeps the expanded blocking list out of the fixed header", () => {
    const headerIdx = src.indexOf('data-testid="review-fields-scroll"');
    const linesIdx = src.indexOf('data-testid="line-items-scroll"');
    const dialogIdx = src.indexOf('data-testid="blocking-issues-dialog"');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(linesIdx).toBeGreaterThan(headerIdx);
    expect(src.slice(headerIdx, linesIdx)).not.toContain("<BlockingBanner");
    expect(src.slice(headerIdx, linesIdx)).toContain("View all issues");
    expect(dialogIdx).toBeGreaterThan(linesIdx);
    expect(src.slice(dialogIdx)).toContain("<BlockingBanner");
  });

  it("scrolls line issues inside the line-item viewport and keeps the row highlight", () => {
    const start = src.indexOf("const goToLine = useCallback");
    const end = src.indexOf("const updateInvoiceStatus", start);
    const block = src.slice(start, end);
    expect(block).toContain("line-items-scroll");
    expect(block).toContain("container.scrollTo");
    expect(block).toContain("container.clientHeight");
    expect(block).not.toContain("scrollIntoView");
    expect(block).toContain("setHighlightLineIdx(lineIdx)");
  });

  it("offers direct line navigation in the compact issue bar", () => {
    const start = src.indexOf('data-testid="review-issue-bar"');
    const end = src.indexOf("{/* Header fields */}", start);
    const block = src.slice(start, end);
    expect(block).toContain('currentIssue.scope === "line"');
    expect(block).toContain("Go to line");
  });

  it("table header is sticky inside the line-item viewport", () => {
    expect(src).toMatch(/<thead className="sticky top-0[^"]*"/);
  });

  it("keeps compact line controls and Add Line outside the scroll body", () => {
    const toolbarIdx = src.indexOf('data-testid="line-items-toolbar"');
    const scrollIdx = src.indexOf('data-testid="line-items-scroll"');
    const footerIdx = src.indexOf('data-testid="scanner-footer"');
    expect(toolbarIdx).toBeGreaterThan(-1);
    expect(toolbarIdx).toBeLessThan(scrollIdx);
    expect(src.slice(toolbarIdx, scrollIdx)).toContain("Add Line");
    expect(src.slice(scrollIdx, footerIdx)).not.toContain("Add Line");
    expect(src.slice(scrollIdx, footerIdx)).toContain('className="text-xs bg-muted/50 cursor-default font-mono h-7"');
  });

  it("footer with totals and actions sits outside the line-item scroll", () => {
    const c = classesFor("scanner-footer");
    expect(c).toContain("shrink-0");
    expect(c).toContain("flex");
    expect(c).toContain("flex-wrap");
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
