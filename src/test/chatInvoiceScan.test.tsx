import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatScanCard } from "@/components/invoices/ChatScanCard";

const base = {
  supplier: "Sun Kee Seafood", number: "INV-1", date: "2026-11-18", total: 2160, currency: "HKD",
  lines: [{ key: "a", index: 0, name: "Tiger prawns", billed: 4, accepted: 4, unit: "kg", total: 1120 }, { key: "b", index: 2, name: "Squid", billed: 8, accepted: 8, unit: "kg", total: 1040 }],
  termsDays: 30, printedDue: null, saving: false,
};

describe("Bani chat invoice booking", () => {
  it("asks to confirm, then terms and delivery, before Book it", () => {
    const onBook = vi.fn();
    render(<ChatScanCard {...base} phase="ready" onField={vi.fn()} onQty={vi.fn()} onBook={onBook} onOpenFull={vi.fn()} />);
    expect(screen.queryByText("Book it")).toBeNull();
    fireEvent.click(screen.getByText("All correct"));
    fireEvent.click(screen.getByText("30 days"));
    fireEvent.click(screen.getByText("Today"));
    fireEvent.click(screen.getByText("Book it"));
    expect(onBook).toHaveBeenCalledWith(expect.objectContaining({ dueDate: "2026-12-18", paid: false }));
  });

  it("changes the received quantity of the real scanner line", () => {
    const onQty = vi.fn();
    render(<ChatScanCard {...base} phase="ready" onField={vi.fn()} onQty={onQty} onBook={vi.fn()} onOpenFull={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Less Squid"));
    expect(onQty).toHaveBeenCalledWith(2, 7);
  });

  it("sends anything unclear to the full review and never offers Book it", () => {
    const onOpenFull = vi.fn();
    render(<ChatScanCard {...base} phase="review" onField={vi.fn()} onQty={vi.fn()} onBook={vi.fn()} onOpenFull={onOpenFull} />);
    expect(screen.queryByText("Book it")).toBeNull();
    fireEvent.click(screen.getByText("Open full review"));
    expect(onOpenFull).toHaveBeenCalled();
  });

  it("books through the one scanner save path", () => {
    const chat = readFileSync("src/components/assistant/ChatInvoiceScan.tsx", "utf8");
    const tab = readFileSync("src/components/procurement/ProcurementInvoicesTab.tsx", "utf8");
    expect(chat).toContain("saveScannerInvoice(");
    expect(tab).toContain("saveScannerInvoice(");
    const grn = readFileSync("src/utils/autoCreateGrnFromInvoice.ts", "utf8");
    expect(grn).toMatch(/opts\.receivedDate && \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test/);
  });
});
